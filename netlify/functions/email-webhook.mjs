import { CONFIG } from '../../email/lib/config.mjs';
import { verifyWebhookSignature } from '../../email/lib/webhookVerify.mjs';
import { query, logEvent } from '../../email/lib/db.mjs';

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

// Resend event types that change a subscriber's standing. Delivery/open/click
// events are just logged (we don't rely on open tracking for anything).
const STATUS_FOR_EVENT = {
  'email.bounced': 'bounced',
  'email.complained': 'complained',
};

async function findSubscriberId(messageId, toEmail) {
  if (messageId) {
    const { rows } = await query('select subscriber_id from sends where provider_message_id = $1 limit 1', [messageId]);
    if (rows[0]) return rows[0].subscriber_id;
  }
  if (toEmail) {
    const { rows } = await query('select id from subscribers where email = $1', [String(toEmail).toLowerCase()]);
    if (rows[0]) return rows[0].id;
  }
  return null;
}

export default async (req) => {
  if (req.method !== 'POST') return json(405, { ok: false });

  const body = await req.text();
  const verified = verifyWebhookSignature({
    id: req.headers.get('svix-id'),
    timestamp: req.headers.get('svix-timestamp'),
    body,
    signatureHeader: req.headers.get('svix-signature'),
    secret: CONFIG.webhookSecret,
  });
  if (!verified) return json(401, { ok: false, error: 'invalid_signature' });

  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    return json(400, { ok: false, error: 'invalid_json' });
  }

  const type = payload.type;
  const data = payload.data || {};
  const messageId = data.email_id || data.id;
  const toEmail = Array.isArray(data.to) ? data.to[0] : data.to;

  const subscriberId = await findSubscriberId(messageId, toEmail);
  await logEvent(subscriberId, `webhook:${type}`, { messageId, to: toEmail });

  const newStatus = STATUS_FOR_EVENT[type];
  if (newStatus && subscriberId) {
    await query('update subscribers set status = $2 where id = $1 and status not in ($2, \'unsubscribed\')', [subscriberId, newStatus]);
    if (messageId) {
      await query(`update sends set status = $2 where provider_message_id = $1`, [messageId, newStatus]);
    }
  }

  return json(200, { ok: true });
};
