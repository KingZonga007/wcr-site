import { Marked } from 'marked';
import { CONFIG } from './config.mjs';

// Email HTML has to survive Gmail, Outlook and Apple Mail, so everything is
// tables and inline styles. Authors write plain Markdown plus three extras:
//   [Get tickets](https://...){button}     one button; consecutive lines make a grid
//   ::: note / ::: verse ... :::            dark panel / scripture callout
//   ![alt](/img/email/x.jpg "small")        "small" or "medium" width; default full
// and frontmatter `hero`, `hero_alt`, `hero_link`, `eyebrow`.

const C = {
  page: '#0a0c16',
  card: '#f4efe6',
  ink: '#1d1f2b',
  heading: '#0a0c16',
  muted: '#aeb2c6',
  rule: '#d9d1c2',
  link: '#2b44d6',
  eyebrow: '#9a5c12',
  panel: '#161a33',
  panelInk: '#f4efe6',
  accent: '#f2a33a',
  accentInk: '#1a1206',
};
const SERIF = "Georgia,'Times New Roman',serif";
const HEAD = "Oswald,'Arial Narrow',Arial,sans-serif";
const SANS = "Helvetica,Arial,sans-serif";

const THEMES = {
  body: { text: C.ink, heading: C.heading, link: C.link, rule: C.rule },
  note: { text: C.panelInk, heading: C.panelInk, link: C.accent, rule: '#2f355c' },
  verse: { text: C.heading, heading: C.heading, link: C.link, rule: C.rule },
};

const BUTTON_LINE = /^\s*\[([^\]]+)\]\(([^)\s]+)\)\{button\}\s*$/;
const CONTAINER_OPEN = /^:::\s*(note|verse)\s*$/;
const CONTAINER_CLOSE = /^:::\s*$/;

function esc(s) {
  return String(s ?? '')
    .replace(/&(?!(#\d+|#x[0-9a-f]+|[a-z]+);)/gi, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

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

function absolute(src, assetBase) {
  return src.startsWith('/') ? `${assetBase}${src}` : src;
}

function buttonHtml(text, href, full = false) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"${full ? ' width="100%"' : ''} style="margin:0 auto"><tr>
<td align="center" bgcolor="${C.accent}" style="border-radius:999px;background:${C.accent}">
<a href="${esc(href)}" style="display:${full ? 'block' : 'inline-block'};padding:${full ? '14px 16px' : '14px 30px'};font-family:${HEAD};font-size:16px;font-weight:600;letter-spacing:1px;text-transform:uppercase;line-height:1.2;color:${C.accentInk};text-decoration:none;border-radius:999px">${esc(text)}</a>
</td></tr></table>`;
}

function buttonGroupHtml(buttons) {
  if (buttons.length === 1) {
    return `<div style="margin:28px 0">${buttonHtml(buttons[0].text, buttons[0].href)}</div>`;
  }
  const rows = [];
  for (let i = 0; i < buttons.length; i += 2) {
    const pair = buttons.slice(i, i + 2);
    if (pair.length === 2) {
      rows.push(`<tr>${pair
        .map((b) => `<td class="btn-cell" width="50%" valign="top" style="padding:6px">${buttonHtml(b.text, b.href, true)}</td>`)
        .join('')}</tr>`);
    } else {
      rows.push(`<tr><td class="btn-cell" colspan="2" align="center" style="padding:6px">${buttonHtml(pair[0].text, pair[0].href)}</td></tr>`);
    }
  }
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0">${rows.join('')}</table>`;
}

// Splits the body into plain-markdown and ::: container segments.
function segments(markdown) {
  const out = [];
  let current = { kind: 'body', lines: [] };
  for (const line of markdown.split('\n')) {
    const open = line.match(CONTAINER_OPEN);
    if (open && current.kind === 'body') {
      out.push(current);
      current = { kind: open[1], lines: [] };
    } else if (CONTAINER_CLOSE.test(line) && current.kind !== 'body') {
      out.push(current);
      current = { kind: 'body', lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  out.push(current);
  return out.filter((s) => s.lines.some((l) => l.trim()));
}

// Pulls runs of {button} lines out before Markdown parsing and leaves a
// placeholder, since Markdown has no notion of a button.
function extractButtons(lines, campaignId, store) {
  const out = [];
  let run = [];
  const flush = () => {
    if (!run.length) return;
    store.push(run);
    out.push('', `<!--BTN:${store.length - 1}-->`, '');
    run = [];
  };
  for (const line of lines) {
    const m = line.match(BUTTON_LINE);
    if (m) run.push({ text: m[1], href: addUtm(m[2], campaignId) });
    else {
      flush();
      out.push(line);
    }
  }
  flush();
  return out.join('\n');
}

function styleTags(html, t) {
  const p = `margin:0 0 18px;font-family:${SERIF};font-size:17px;line-height:1.65;color:${t.text}`;
  const h = (size) => `margin:30px 0 12px;font-family:${HEAD};font-size:${size}px;font-weight:600;line-height:1.15;letter-spacing:.5px;text-transform:uppercase;color:${t.heading}`;
  return html
    .replace(/<p>/g, `<p style="${p}">`)
    .replace(/<h1>/g, `<h1 style="${h(30)}">`)
    .replace(/<h2>/g, `<h2 style="${h(24)}">`)
    .replace(/<h3>/g, `<h3 style="${h(19)}">`)
    .replace(/<(ul|ol)>/g, `<$1 style="margin:0 0 18px;padding-left:24px;font-family:${SERIF};font-size:17px;line-height:1.65;color:${t.text}">`)
    .replace(/<li>/g, '<li style="margin:0 0 6px">')
    .replace(/<blockquote>/g, `<blockquote style="margin:0 0 18px;padding:2px 0 2px 18px;border-left:3px solid ${C.accent}">`)
    .replace(/<hr>/g, `<hr style="border:0;border-top:1px solid ${t.rule};margin:30px 0">`)
    .replace(/<code>/g, `<code style="font-family:Menlo,Consolas,monospace;font-size:14px;padding:1px 4px;border-radius:4px;background:rgba(0,0,0,.07)">`);
}

function renderMarkdown(markdown, { campaignId, theme, assetBase }) {
  const t = THEMES[theme];
  const marked = new Marked({
    renderer: {
      link({ href, tokens }) {
        const inner = this.parser.parseInline(tokens);
        const isImage = tokens.length === 1 && tokens[0].type === 'image';
        const style = isImage ? 'text-decoration:none' : `color:${t.link};text-decoration:underline`;
        return `<a href="${esc(addUtm(href, campaignId))}" style="${style}">${inner}</a>`;
      },
      image({ href, title, text }) {
        const src = esc(absolute(href, assetBase));
        const size = { small: 200, medium: 340 }[String(title || '').toLowerCase()];
        if (size) {
          return `<img src="${src}" alt="${esc(text)}" width="${size}" style="display:block;width:${size}px;max-width:100%;height:auto;border:0;border-radius:6px">`;
        }
        return `<img src="${src}" alt="${esc(text)}" width="512" style="display:block;width:100%;max-width:512px;height:auto;border:0;border-radius:8px;margin:0 auto">`;
      },
    },
  });
  const buttons = [];
  const prepared = extractButtons(markdown.split('\n'), campaignId, buttons);
  let html = styleTags(marked.parse(prepared), t);
  html = html.replace(/<!--BTN:(\d+)-->/g, (_, i) => buttonGroupHtml(buttons[Number(i)]));
  // A heading that opens a block shouldn't stack its top margin on the padding.
  return html.replace(/^(\s*<h\d style=")margin:30px/, '$1margin:0');
}

function renderBody(markdown, opts) {
  return segments(markdown)
    .map((seg) => {
      const md = seg.lines.join('\n');
      const inner = renderMarkdown(md, { ...opts, theme: seg.kind });
      if (seg.kind === 'note') {
        return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:10px 0 28px"><tr>
<td bgcolor="${C.panel}" style="background:${C.panel};border-radius:10px;padding:30px 30px 14px">${inner}</td></tr></table>`;
      }
      if (seg.kind === 'verse') {
        const verse = inner
          .replace(/font-size:17px;line-height:1.65/g, 'font-size:21px;line-height:1.5;font-style:italic')
          .replace(/<p style="/g, '<p style="text-align:center;');
        return `<div style="margin:12px 0 30px;padding:24px 8px 8px;border-top:2px solid ${C.accent};border-bottom:2px solid ${C.accent}">${verse}</div>`;
      }
      return inner;
    })
    .join('\n');
}

function toPlainText(html) {
  return html
    .replace(/<a\s+href="([^"]+)"[^>]*>\s*<img[^>]*>\s*<\/a>/gi, '')
    .replace(/<img[^>]*>/gi, '')
    .replace(/<a\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href, text) => `${text.replace(/<[^>]+>/g, '').trim()} (${href.replace(/&amp;/g, '&')})`)
    .replace(/<\/(p|h\d|div|blockquote|table)>/gi, '\n\n')
    .replace(/<\/li>\s*/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function footerHtml({ unsubscribeUrl, assetBase }) {
  const icons = CONFIG.social
    .map((s) => `<td style="padding:0 7px"><a href="${s.url}" style="text-decoration:none"><img src="${assetBase}/img/email/${s.icon}" alt="${s.name}" width="36" height="36" style="display:block;border:0;width:36px;height:36px"></a></td>`)
    .join('');
  const small = `margin:0 0 8px;font-family:${SANS};font-size:13px;line-height:1.6;color:${C.muted}`;
  return `<tr><td align="center" style="padding:30px 24px 40px">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 22px"><tr>${icons}</tr></table>
${unsubscribeUrl ? `<p style="${small}">You're getting this because you signed up at <a href="${CONFIG.siteUrl}" style="color:${C.muted};text-decoration:underline">westcoastrevival.org</a>.</p>` : ''}
<p style="${small}">${CONFIG.fromName} &middot; ${CONFIG.address}</p>
${unsubscribeUrl ? `<p style="${small}"><a href="${esc(unsubscribeUrl)}" style="color:${C.panelInk};text-decoration:underline">Unsubscribe</a></p>` : ''}
</td></tr>`;
}

// meta is the email's frontmatter. unsubscribeUrl is only set for emails sent
// to already-active subscribers (welcome sequence, campaigns); the
// confirmation email omits it because there's nothing to unsubscribe from yet.
// assetBase lets a local preview load images from disk instead of the live site.
export function renderEmail({ campaignId, bodyMarkdown, meta = {}, preheader, unsubscribeUrl, assetBase = CONFIG.siteUrl }) {
  const pre = preheader ?? meta.preheader ?? '';
  const bodyHtml = renderBody(bodyMarkdown, { campaignId, assetBase });

  const hero = meta.hero
    ? (() => {
        const img = `<img src="${esc(absolute(meta.hero, assetBase))}" alt="${esc(meta.hero_alt || '')}" width="600" style="display:block;width:100%;max-width:600px;height:auto;border:0;border-radius:10px 10px 0 0">`;
        const link = meta.hero_link ? `<a href="${esc(addUtm(meta.hero_link, campaignId))}" style="text-decoration:none">${img}</a>` : img;
        return `<tr><td style="padding:0;line-height:0;font-size:0">${link}</td></tr>`;
      })()
    : '';
  const eyebrow = meta.eyebrow
    ? `<p style="margin:0 0 16px;font-family:${HEAD};font-size:14px;font-weight:500;letter-spacing:2.5px;text-transform:uppercase;color:${C.eyebrow}">${esc(meta.eyebrow)}</p>`
    : '';

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;600&display=swap" rel="stylesheet">
<style>
  @media (max-width: 620px) {
    .card-pad { padding: 30px 22px 14px !important; }
    .btn-cell { display: block !important; width: 100% !important; box-sizing: border-box; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${C.page}">
${pre ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all">${esc(pre)}${'&nbsp;&zwnj;'.repeat(60)}</div>` : ''}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.page}" style="background:${C.page}"><tr><td align="center" style="padding:0 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px">
<tr><td align="center" style="padding:30px 0 24px">
  <a href="${esc(addUtm(CONFIG.siteUrl, campaignId))}" style="font-family:${HEAD};font-size:22px;font-weight:600;letter-spacing:4px;text-transform:uppercase;color:${C.panelInk};text-decoration:none">West Coast Revival</a>
</td></tr>
${hero}
<tr><td class="card-pad" bgcolor="${C.card}" style="background:${C.card};padding:40px 44px 18px;border-radius:${hero ? '0 0 10px 10px' : '10px'}">
${eyebrow}
${bodyHtml}
</td></tr>
${footerHtml({ unsubscribeUrl, assetBase })}
</table>
</td></tr></table>
</body>
</html>`;

  const footerText = unsubscribeUrl
    ? `You're getting this because you signed up at westcoastrevival.org.\n${CONFIG.fromName}, ${CONFIG.address}\nUnsubscribe: ${unsubscribeUrl}`
    : `${CONFIG.fromName}, ${CONFIG.address}`;
  const text = `${meta.eyebrow ? `${meta.eyebrow.toUpperCase()}\n\n` : ''}${toPlainText(bodyHtml)}\n\n---\n${footerText}`;
  return { html, text };
}
