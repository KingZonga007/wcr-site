#!/usr/bin/env node
// Runs every 15 minutes from GitHub Actions. Upserts campaign markdown files
// into the campaigns table, then sends any campaign whose send_at has passed.
// Safe to re-run: per-recipient sends are reserved before sending, so retrying
// a half-finished run never double-sends.
import { query, logEvent, closePool } from '../../email/lib/db.mjs';
import { loadCampaignFiles } from '../../email/lib/content.mjs';
import { subscribersInSegment } from '../../email/lib/segments.mjs';
import { renderEmail } from '../../email/lib/template.mjs';
import { sendEmail } from '../../email/lib/send.mjs';
import { makeToken } from '../../email/lib/token.mjs';
import { CONFIG } from '../../email/lib/config.mjs';
import { canSendNow, reserveSend, finishSend, sleep } from '../../email/lib/sendGuard.mjs';

const DRY_RUN = process.argv.includes('--dry-run');
const SEND_DELAY_MS = 550; // keeps us under ~2 requests/sec on Resend's free tier

async function upsertCampaigns() {
  const files = loadCampaignFiles();
  for (const file of files) {
    if (!file.subject || !file.sendAt) {
      console.error(`Skipping ${file.id}: missing subject or send_at`);
      continue;
    }
    await query(
      `insert into campaigns (id, subject, segment, send_at)
       values ($1, $2, $3, $4)
       on conflict (id) do update set
         subject = excluded.subject,
         segment = excluded.segment,
         send_at = excluded.send_at
       where campaigns.status = 'scheduled'`,
      [file.id, file.subject, file.segment, file.sendAt]
    );
  }
  return files;
}

async function dueCampaigns() {
  const { rows } = await query(
    `select * from campaigns where status in ('scheduled', 'sending') and send_at <= now() order by send_at`
  );
  return rows;
}

async function sendTestCampaign(campaign, file) {
  // Test sends aren't tied to a real subscriber, so there's no valid unsubscribe
  // token to give them; the link just shows the "expired" fallback page.
  const unsubscribeUrl = `${CONFIG.siteUrl}/api/unsubscribe?token=test-send-not-a-real-subscriber`;
  const { html, text } = renderEmail({ campaignId: campaign.id, bodyMarkdown: file.body, preheader: file.preheader, unsubscribeUrl });
  let sentCount = 0;
  for (const to of CONFIG.testRecipients) {
    try {
      await sendEmail({ to, subject: campaign.subject, html, text, unsubscribeUrl });
      sentCount++;
    } catch (err) {
      console.error(`Test send to ${to} failed:`, err.message);
    }
    await sleep(SEND_DELAY_MS);
  }
  await query(`update campaigns set status = 'sent', sent_at = now(), sent_count = $2 where id = $1`, [campaign.id, sentCount]);
  await logEvent(null, 'campaign_test_sent', { campaignId: campaign.id, sentCount });
}

async function sendRealCampaign(campaign, file) {
  const subscribers = await subscribersInSegment(campaign.segment);
  let sentThisRun = 0;
  for (const subscriber of subscribers) {
    if (!canSendNow(subscriber.last_sent_at)) continue;
    const sendId = await reserveSend({ subscriberId: subscriber.id, campaignId: campaign.id });
    if (!sendId) continue; // already sent (or reserved) in an earlier run

    const unsubscribeToken = makeToken(subscriber.id, 'unsubscribe', 3650);
    const unsubscribeUrl = `${CONFIG.siteUrl}/api/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`;
    const { html, text } = renderEmail({ campaignId: campaign.id, bodyMarkdown: file.body, preheader: file.preheader, unsubscribeUrl });

    try {
      const result = await sendEmail({ to: subscriber.email, subject: campaign.subject, html, text, unsubscribeUrl });
      await finishSend(sendId, subscriber.id, { ok: true, messageId: result.messageId });
      sentThisRun++;
    } catch (err) {
      await finishSend(sendId, subscriber.id, { ok: false });
      await logEvent(subscriber.id, 'campaign_send_failed', { campaignId: campaign.id, error: String(err) });
    }
    await sleep(SEND_DELAY_MS);
  }

  const { rows } = await query(`select count(*)::int as n from sends where campaign_id = $1 and status = 'sent'`, [campaign.id]);
  await query(`update campaigns set status = 'sent', sent_at = now(), sent_count = $2 where id = $1`, [campaign.id, rows[0].n]);
  console.log(`Campaign ${campaign.id}: sent ${sentThisRun} this run, ${rows[0].n} total.`);
}

async function main() {
  const files = await upsertCampaigns();
  const byId = new Map(files.map((f) => [f.id, f]));
  const due = await dueCampaigns();

  if (due.length === 0) {
    console.log('No due campaigns.');
    return;
  }

  for (const campaign of due) {
    const file = byId.get(campaign.id);
    if (!file) {
      console.error(`Campaign ${campaign.id} is due but its markdown file is missing. Skipping.`);
      continue;
    }

    if (DRY_RUN) {
      const recipients = campaign.segment === 'test' ? CONFIG.testRecipients : await subscribersInSegment(campaign.segment);
      const { html } = renderEmail({ campaignId: campaign.id, bodyMarkdown: file.body, preheader: file.preheader, unsubscribeUrl: `${CONFIG.siteUrl}/api/unsubscribe?token=PREVIEW` });
      console.log(`--- DRY RUN: ${campaign.id} (segment: ${campaign.segment}, recipients: ${recipients.length}) ---`);
      console.log(`Subject: ${campaign.subject}`);
      console.log(html);
      continue;
    }

    if (campaign.status === 'scheduled') {
      const claimed = await query(`update campaigns set status = 'sending' where id = $1 and status = 'scheduled' returning id`, [campaign.id]);
      if (!claimed.rows[0]) continue; // claimed by a concurrent run
    }

    if (campaign.segment === 'test') {
      await sendTestCampaign(campaign, file);
    } else {
      await sendRealCampaign(campaign, file);
    }
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(closePool);
