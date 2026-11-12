import crypto from 'node:crypto';

// Resend signs webhooks the way Svix does: HMAC-SHA256 over
// "<id>.<timestamp>.<body>" using the secret after its "whsec_" prefix,
// compared against one of the space-separated "v1,<base64>" values in
// svix-signature. Implemented by hand to avoid an extra dependency.
export function verifyWebhookSignature({ id, timestamp, body, signatureHeader, secret }) {
  if (!id || !timestamp || !signatureHeader || !secret) return false;
  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const signedContent = `${id}.${timestamp}.${body}`;
  const expected = crypto.createHmac('sha256', secretBytes).update(signedContent).digest('base64');
  const candidates = signatureHeader.split(' ').map((v) => v.split(',')[1]).filter(Boolean);
  return candidates.some((candidate) => {
    const a = Buffer.from(candidate);
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  });
}
