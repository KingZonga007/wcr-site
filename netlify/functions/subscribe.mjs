import { normalizeEmail, isValidEmail, tagsFor, rateLimited, upsertSubscriber } from '../../email/lib/subscribers.mjs';
import { sendConfirmationEmail } from '../../email/lib/confirmation.mjs';

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export default async (req, context) => {
  if (req.method !== 'POST') return json(405, { ok: false, error: 'method_not_allowed' });

  const bodyText = await req.text();
  const params = new URLSearchParams(bodyText);

  const company = (params.get('company') || '').trim();
  const email = normalizeEmail(params.get('email'));
  const source = params.get('source') || 'unknown';
  const song = params.get('song') || '';
  const event = params.get('event') || 'sign_up';
  const musician = params.get('musician') === 'yes';
  const consentText = params.get('consent_text') || '';
  const utmSource = params.get('utm_source') || '';
  const utmMedium = params.get('utm_medium') || '';
  const utmCampaign = params.get('utm_campaign') || '';

  // Honeypot: silently succeed without doing anything, so a bot can't tell it failed.
  if (company) return json(200, { ok: true });

  if (!email || !isValidEmail(email)) return json(400, { ok: false, error: 'invalid_email' });

  const ip = context.ip || req.headers.get('x-nf-client-connection-ip') || '';
  const userAgent = req.headers.get('user-agent') || '';

  if (await rateLimited({ ip, email })) return json(429, { ok: false, error: 'rate_limited' });

  const tags = tagsFor({ musician, source, event });
  const { subscriber, isNew } = await upsertSubscriber({
    email,
    source,
    song,
    utmSource,
    utmMedium,
    utmCampaign,
    tags,
    consentText,
    consentIp: ip,
    consentUserAgent: userAgent,
  });

  // Only pending subscribers need a (re-sent) confirmation email. Someone already
  // active or unsubscribed-then-resubscribed (now pending again) also gets one.
  if (subscriber.status === 'pending') {
    await sendConfirmationEmail(subscriber);
  }

  return json(200, { ok: true, isNew });
};
