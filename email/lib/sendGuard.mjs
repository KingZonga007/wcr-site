import { query } from './db.mjs';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
export const MIN_DAYS_BETWEEN_SENDS = 3;

export function canSendNow(lastSentAt) {
  if (!lastSentAt) return true;
  return Date.now() - new Date(lastSentAt).getTime() >= MIN_DAYS_BETWEEN_SENDS * MS_PER_DAY;
}

// Reserves a row in `sends` before attempting to send. The unique constraints
// on (campaign_id, subscriber_id) and (sequence_step, subscriber_id) mean a
// re-run can never double-send: a second reservation attempt returns no row.
export async function reserveSend({ subscriberId, campaignId = null, sequenceStep = null }) {
  if (!!campaignId === !!sequenceStep) {
    throw new Error('reserveSend needs exactly one of campaignId or sequenceStep');
  }
  // A NULL column never conflicts with itself in Postgres, so only the
  // non-null one's unique constraint can actually catch a duplicate here.
  const conflictTarget = campaignId ? 'campaign_id, subscriber_id' : 'sequence_step, subscriber_id';
  const { rows } = await query(
    `insert into sends (subscriber_id, campaign_id, sequence_step, status)
     values ($1, $2, $3, 'queued')
     on conflict (${conflictTarget}) do nothing
     returning id`,
    [subscriberId, campaignId, sequenceStep]
  );
  return rows[0]?.id || null;
}

// countsTowardCadence: false for opt-in streams (WIW episodes, the weekly
// digest, video alerts) so they don't hold back regular campaigns.
export async function finishSend(sendId, subscriberId, result, { countsTowardCadence = true } = {}) {
  if (result.ok) {
    await query(`update sends set status = 'sent', sent_at = now(), provider_message_id = $2 where id = $1`, [sendId, result.messageId || null]);
    if (countsTowardCadence) await query(`update subscribers set last_sent_at = now() where id = $1`, [subscriberId]);
  } else {
    await query(`update sends set status = 'failed' where id = $1`, [sendId]);
  }
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
