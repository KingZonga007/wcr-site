#!/usr/bin/env node
// Runs every 15 minutes from GitHub Actions. Upserts campaign markdown files
// (regular and release campaigns) into the campaigns table, then sends any
// whose send_at has passed. Safe to re-run: per-recipient sends are reserved
// before sending, so retrying a half-finished run never double-sends.
// Automatic emails (episodes, digest, videos) are sent by send-triggered.mjs.
import { query, closePool } from '../../email/lib/db.mjs';
import { loadCampaignFiles } from '../../email/lib/content.mjs';
import { subscribersInSegment } from '../../email/lib/segments.mjs';
import { renderEmail } from '../../email/lib/template.mjs';
import { CONFIG } from '../../email/lib/config.mjs';
import { claimCampaign, deliverCampaign } from '../../email/lib/campaignSender.mjs';
import { hasUnfilledMarkers } from '../../email/lib/fill.mjs';

const DRY_RUN = process.argv.includes('--dry-run');

async function upsertCampaigns() {
  const files = loadCampaignFiles();
  for (const file of files) {
    if (!file.subject || !file.sendAt) {
      console.error(`Skipping ${file.id}: missing subject or send_at`);
      continue;
    }
    await query(
      `insert into campaigns (id, subject, segment, send_at, kind, ref)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (id) do update set
         subject = excluded.subject,
         segment = excluded.segment,
         send_at = excluded.send_at,
         kind = excluded.kind,
         ref = excluded.ref
       where campaigns.status = 'scheduled'`,
      [file.id, file.subject, file.segment, file.sendAt, file.meta.release ? 'release' : 'campaign', file.meta.release || null]
    );
  }
  return files;
}

async function main() {
  const files = await upsertCampaigns();
  const byId = new Map(files.map((f) => [f.id, f]));
  const { rows: due } = await query(
    `select * from campaigns where kind in ('campaign', 'release') and status in ('scheduled', 'sending') and send_at <= now() order by send_at`
  );

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
    if (hasUnfilledMarkers(`${file.subject}\n${file.body}`)) {
      console.error(`Campaign ${campaign.id} still has [WRITE: ...] or {{...}} placeholders. Not sending.`);
      process.exitCode = 1;
      continue;
    }

    if (DRY_RUN) {
      const recipients = campaign.segment === 'test' ? CONFIG.testRecipients : await subscribersInSegment(campaign.segment);
      const { html } = renderEmail({ campaignId: campaign.id, bodyMarkdown: file.body, meta: file.meta, unsubscribeUrl: `${CONFIG.siteUrl}/api/unsubscribe?token=PREVIEW` });
      console.log(`--- DRY RUN: ${campaign.id} (${campaign.kind}, segment: ${campaign.segment}, recipients: ${recipients.length}) ---`);
      console.log(`Subject: ${campaign.subject}`);
      console.log(html);
      continue;
    }

    if (!(await claimCampaign(campaign))) continue;
    await deliverCampaign(campaign, { body: file.body, meta: file.meta });
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(closePool);
