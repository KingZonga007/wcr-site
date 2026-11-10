import { Marked } from 'marked';
import { CONFIG } from './config.mjs';

// Appends UTM params to absolute http(s) links so clicks show up in GA4, without
// touching mailto:, anchors, or links that already carry their own utm_source.
function addUtm(href, campaignId) {
  if (!/^https?:\/\//i.test(href)) return href;
  let url;
  try {
    url = new URL(href);
  } catch {
    return href;
  }
  if (url.searchParams.has('utm_source')) return href;
  url.searchParams.set('utm_source', 'newsletter');
  url.searchParams.set('utm_medium', 'email');
  url.searchParams.set('utm_campaign', campaignId);
  return url.toString();
}

function markedFor(campaignId) {
  return new Marked({
    renderer: {
      link({ href, tokens }) {
        const text = this.parser.parseInline(tokens);
        return `<a href="${addUtm(href, campaignId)}">${text}</a>`;
      },
    },
  });
}

// Very small HTML -> plain text fallback: good enough for a simple one-column
// layout with headings, paragraphs and links.
function toPlainText(html) {
  return html
    .replace(/<a\s+href="([^"]+)"[^>]*>(.*?)<\/a>/gi, '$2 ($1)')
    .replace(/<\/(p|h\d|li|div)>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li>/gi, '- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// unsubscribeUrl is only set for emails sent to already-active subscribers
// (welcome sequence, campaigns). The confirmation email omits it: there's
// nothing to unsubscribe from yet.
export function renderEmail({ campaignId, bodyMarkdown, preheader, unsubscribeUrl }) {
  const bodyHtml = markedFor(campaignId).parse(bodyMarkdown);
  const footerHtml = unsubscribeUrl
    ? `<p style="font-size:12px;color:#666;margin-top:32px">
      You're receiving this because you signed up for West Coast Revival emails.<br>
      ${CONFIG.fromName}, ${CONFIG.address}<br>
      <a href="${unsubscribeUrl}">Unsubscribe</a>
    </p>`
    : `<p style="font-size:12px;color:#666;margin-top:32px">${CONFIG.fromName}, ${CONFIG.address}</p>`;
  const html = `<!doctype html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f4">
  ${preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${preheader}</div>` : ''}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
    <table role="presentation" width="100%" style="max-width:600px;background:#fff;border-radius:8px" cellpadding="0" cellspacing="0"><tr><td style="padding:32px;font-family:Georgia,'Times New Roman',serif;color:#1a1a1a;font-size:16px;line-height:1.5">
      ${bodyHtml}
      ${footerHtml}
    </td></tr></table>
  </td></tr></table>
</body>
</html>`;
  const text = unsubscribeUrl
    ? `${toPlainText(bodyHtml)}\n\n---\nYou're receiving this because you signed up for West Coast Revival emails.\n${CONFIG.fromName}, ${CONFIG.address}\nUnsubscribe: ${unsubscribeUrl}`
    : `${toPlainText(bodyHtml)}\n\n---\n${CONFIG.fromName}, ${CONFIG.address}`;
  return { html, text };
}
