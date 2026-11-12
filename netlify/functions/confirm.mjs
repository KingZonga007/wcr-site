import { CONFIG } from '../../email/lib/config.mjs';
import { verifyToken } from '../../email/lib/token.mjs';
import { query, logEvent } from '../../email/lib/db.mjs';
import { sendDueSequenceSteps } from '../../email/lib/sequenceRunner.mjs';

const redirect = (path) => new Response(null, { status: 302, headers: { location: `${CONFIG.siteUrl}${path}` } });

export default async (req) => {
  const token = new URL(req.url).searchParams.get('token');
  const subscriberId = verifyToken(token, 'confirm');
  if (!subscriberId) return redirect('/thanks?confirmed=0');

  const { rows } = await query('select * from subscribers where id = $1', [subscriberId]);
  const subscriber = rows[0];
  if (!subscriber) return redirect('/thanks?confirmed=0');

  // Bounced/complained addresses stay that way; unsubscribed is handled by
  // re-subscribing through the form, not by an old confirm link.
  if (subscriber.status === 'pending') {
    await query(`update subscribers set status = 'active', confirmed_at = now() where id = $1`, [subscriberId]);
    await logEvent(subscriberId, 'confirmed', {});
  }

  // Fire-and-check: send whatever welcome step is due now (day 0) without
  // blocking the redirect on a slow provider response for too long.
  try {
    await sendDueSequenceSteps(subscriberId);
  } catch (err) {
    await logEvent(subscriberId, 'sequence_trigger_failed', { error: String(err) });
  }

  return redirect('/thanks?confirmed=1');
};
