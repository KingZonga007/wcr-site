import { query, logEvent } from './db.mjs';
import { loadSequenceSteps } from './content.mjs';
import { renderEmail } from './template.mjs';
import { sendEmail } from './send.mjs';
import { makeToken } from './token.mjs';
import { CONFIG } from './config.mjs';
import { canSendNow, reserveSend, finishSend } from './sendGuard.mjs';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const UNSUBSCRIBE_TOKEN_TTL_DAYS = 3650;

// Sends every welcome-sequence step that's due for one subscriber and not sent
// yet. Called right after confirmation (so day 0 arrives immediately) and from
// the daily cron (to catch day 3, day 7, and anything missed).
export async function sendDueSequenceSteps(subscriberId) {
  const { rows } = await query('select * from subscribers where id = $1', [subscriberId]);
  const subscriber = rows[0];
  if (!subscriber || subscriber.status !== 'active' || !subscriber.confirmed_at) return { sent: [] };

  const steps = loadSequenceSteps('welcome');
  const elapsedDays = (Date.now() - new Date(subscriber.confirmed_at).getTime()) / MS_PER_DAY;
  const sent = [];
  let lastSentAt = subscriber.last_sent_at;

  for (const step of steps) {
    if (step.delayDays > elapsedDays) break;
    if (!canSendNow(lastSentAt)) break;

    const sendId = await reserveSend({ subscriberId, sequenceStep: step.step });
    if (!sendId) continue; // already sent (or queued by a concurrent run)

    const unsubscribeToken = makeToken(subscriber.id, 'unsubscribe', UNSUBSCRIBE_TOKEN_TTL_DAYS);
    const unsubscribeUrl = `${CONFIG.siteUrl}/api/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`;
    const { html, text } = renderEmail({ campaignId: step.step, bodyMarkdown: step.body, meta: step.meta, unsubscribeUrl });

    try {
      const result = await sendEmail({ to: subscriber.email, subject: step.subject, html, text, unsubscribeUrl });
      await finishSend(sendId, subscriber.id, { ok: true, messageId: result.messageId });
      await logEvent(subscriber.id, 'sequence_step_sent', { step: step.step });
      sent.push(step.step);
      lastSentAt = new Date().toISOString();
    } catch (err) {
      await finishSend(sendId, subscriber.id, { ok: false });
      await logEvent(subscriber.id, 'sequence_step_failed', { step: step.step, error: String(err) });
    }
  }

  return { sent };
}
