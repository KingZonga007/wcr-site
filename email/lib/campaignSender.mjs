import { query, logEvent } from './db.mjs';
import { subscribersInSegment } from './segments.mjs';
import { renderEmail } from './template.mjs';
import { sendEmail } from './send.mjs';
import { makeToken } from './token.mjs';
import { CONFIG } from './config.mjs';
import { canSendNow, reserveSend, finishSend, sleep } from './sendGuard.mjs';

const SEND_DELAY_MS = 550; // keeps us under ~2 requests/sec on Resend's free tier

// How each kind of email treats the "one email per 3 days" guard.
// respect: skip people who got a cadence-counting email in the last 3 days.
// counts: whether this send starts a new 3-day window for that person.
export const CADENCE = {
  campaign: { respect: true, counts: true },
  release: { respect: false, counts: true },
  wiw_episode: { respect: false, counts: false },
  wiw_digest: { respect: false, counts: false },
  video: { respect: false, counts: false },
};

// scheduled -> sending, so two overlapping runs can't both start the same campaign.
export async function claimCampaign(campaign) {
  if (campaign.status !== 'scheduled') return true;
  const { rows } = await query(`update campaigns set status = 'sending' where id = $1 and status = 'scheduled' returning id`, [campaign.id]);
  return !!rows[0];
}

async function sendToTestList(campaign, { body, meta }) {
  // Test sends aren't tied to a real subscriber, so there's no valid unsubscribe
  // token to give them; the link just shows the "expired" fallback page.
  const unsubscribeUrl = `${CONFIG.siteUrl}/api/unsubscribe?token=test-send-not-a-real-subscriber`;
  const { html, text } = renderEmail({ campaignId: campaign.id, bodyMarkdown: body, meta, unsubscribeUrl });
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
  return sentCount;
}

// Sends an already-claimed campaign to its segment. Safe to re-run: each
// recipient is reserved in `sends` first, so a retry skips anyone already done.
export async function deliverCampaign(campaign, { body, meta = {} }) {
  if (campaign.segment === 'test') return sendToTestList(campaign, { body, meta });

  const rules = CADENCE[campaign.kind] || CADENCE.campaign;
  const subscribers = await subscribersInSegment(campaign.segment);
  let sentThisRun = 0;
  for (const subscriber of subscribers) {
    if (rules.respect && !canSendNow(subscriber.last_sent_at)) continue;
    const sendId = await reserveSend({ subscriberId: subscriber.id, campaignId: campaign.id });
    if (!sendId) continue;

    const unsubscribeToken = makeToken(subscriber.id, 'unsubscribe', 3650);
    const unsubscribeUrl = `${CONFIG.siteUrl}/api/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`;
    const { html, text } = renderEmail({ campaignId: campaign.id, bodyMarkdown: body, meta, unsubscribeUrl });

    try {
      const result = await sendEmail({ to: subscriber.email, subject: campaign.subject, html, text, unsubscribeUrl });
      await finishSend(sendId, subscriber.id, { ok: true, messageId: result.messageId }, { countsTowardCadence: rules.counts });
      sentThisRun++;
    } catch (err) {
      await finishSend(sendId, subscriber.id, { ok: false });
      await logEvent(subscriber.id, 'campaign_send_failed', { campaignId: campaign.id, error: String(err) });
    }
    await sleep(SEND_DELAY_MS);
  }

  const { rows } = await query(`select count(*)::int as n from sends where campaign_id = $1 and status = 'sent'`, [campaign.id]);
  await query(`update campaigns set status = 'sent', sent_at = now(), sent_count = $2 where id = $1`, [campaign.id, rows[0].n]);
  console.log(`${campaign.kind} ${campaign.id}: sent ${sentThisRun} this run, ${rows[0].n} total.`);
  return sentThisRun;
}
