import { CONFIG } from '../../email/lib/config.mjs';
import { verifyToken } from '../../email/lib/token.mjs';
import { query, logEvent } from '../../email/lib/db.mjs';

const PAGE_CSS = 'font-family:system-ui,sans-serif;max-width:480px;margin:60px auto;padding:0 20px;color:#1a1a1a';

function page(title, body) {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body style="${PAGE_CSS}"><h1>${title}</h1>${body}</body></html>`,
    { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } }
  );
}

async function doUnsubscribe(subscriberId) {
  const { rows } = await query('select * from subscribers where id = $1', [subscriberId]);
  const subscriber = rows[0];
  if (!subscriber) return false;
  if (subscriber.status !== 'unsubscribed') {
    await query(`update subscribers set status = 'unsubscribed', unsubscribed_at = now() where id = $1`, [subscriberId]);
    await logEvent(subscriberId, 'unsubscribed', {});
  }
  return true;
}

// GET is the visible link in an email: it shows a page with one button, not an
// immediate unsubscribe. (Some corporate mail scanners prefetch every GET link
// in an email, which would unsubscribe people who never clicked anything.)
// POST is both that button's target and the Gmail/Yahoo "one-click unsubscribe"
// the List-Unsubscribe-Post header advertises; either way it must act immediately.
export default async (req) => {
  const token = new URL(req.url).searchParams.get('token');
  const subscriberId = verifyToken(token, 'unsubscribe');

  if (!subscriberId) {
    return page('Link expired', `<p>This unsubscribe link is invalid or expired. Email <a href="mailto:${CONFIG.replyTo}">${CONFIG.replyTo}</a> and we'll remove you by hand.</p>`);
  }

  if (req.method === 'POST') {
    const ok = await doUnsubscribe(subscriberId);
    if (!ok) return page('Not found', `<p>We couldn't find that subscription.</p>`);
    return page('Unsubscribed', `<p>You're unsubscribed. You won't get any more emails from West Coast Revival.</p><p>Changed your mind? Sign up again any time at <a href="${CONFIG.siteUrl}">westcoastrevival.org</a>.</p>`);
  }

  const { rows } = await query('select status from subscribers where id = $1', [subscriberId]);
  if (!rows[0]) return page('Not found', `<p>We couldn't find that subscription.</p>`);
  if (rows[0].status === 'unsubscribed') {
    return page('Already unsubscribed', `<p>You're already unsubscribed. You won't get any more emails from West Coast Revival.</p>`);
  }
  return page(
    'Unsubscribe?',
    `<p>Stop getting emails from West Coast Revival?</p>
     <form method="POST" action="${req.url}"><button type="submit" style="font-size:16px;padding:10px 18px">Yes, unsubscribe me</button></form>`
  );
};
