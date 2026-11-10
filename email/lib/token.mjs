import crypto from 'node:crypto';
import { CONFIG } from './config.mjs';

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

function sign(payload) {
  return crypto.createHmac('sha256', CONFIG.tokenSecret).update(payload).digest('base64url');
}

// A signed token binds a subscriber id to a purpose (confirm | unsubscribe) and an
// expiry, so a confirmation link can't be replayed as an unsubscribe link or used
// after it expires.
export function makeToken(subscriberId, purpose, ttlDays = 7) {
  const exp = Date.now() + ttlDays * 24 * 60 * 60 * 1000;
  const payload = base64url(JSON.stringify({ id: subscriberId, purpose, exp }));
  const sig = sign(payload);
  return `${payload}.${sig}`;
}

export function verifyToken(token, purpose) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expectedSig = sign(payload);
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }
  let data;
  try {
    data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (data.purpose !== purpose) return null;
  if (!data.exp || Date.now() > data.exp) return null;
  if (!data.id) return null;
  return data.id;
}
