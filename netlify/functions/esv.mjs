// Live ESV text for devotional pages. Text is fetched from Crossway's ESV API on
// each request and never stored in the site, so the site-wide 500-verse cap for
// stored text does not apply. Per-page limit (500 verses) is enforced by keeping
// each request to the references on one page.
// Requires the ESV_API_KEY environment variable in Netlify (free key from api.esv.org).
export default async (req) => {
  const q = new URL(req.url).searchParams.get('q') || '';
  const refs = q.split('|').map((s) => s.trim()).filter(Boolean).slice(0, 4);
  const key = process.env.ESV_API_KEY;
  const headers = {
    'content-type': 'application/json',
    // Browsers may keep it for a day; Netlify's CDN must not store ESV text.
    'cache-control': 'public, max-age=86400',
    'netlify-cdn-cache-control': 'no-store',
  };
  if (!key || !refs.length) return new Response(JSON.stringify({ passages: [] }), { status: key ? 400 : 503, headers });
  const out = [];
  for (const ref of refs) {
    const u = new URL('https://api.esv.org/v3/passage/text/');
    u.search = new URLSearchParams({
      q: ref,
      'include-passage-references': 'false',
      'include-verse-numbers': 'true',
      'include-first-verse-numbers': 'true',
      'include-footnotes': 'false',
      'include-headings': 'false',
      'include-short-copyright': 'false',
      'include-passage-horizontal-lines': 'false',
      'include-heading-horizontal-lines': 'false',
      'indent-paragraphs': '0',
      'indent-poetry': 'false',
    });
    const r = await fetch(u, { headers: { Authorization: `Token ${key}` } });
    if (!r.ok) { out.push({ ref, verses: [] }); continue; }
    const j = await r.json();
    const text = (j.passages || []).join(' ').replace(/\s+/g, ' ').trim();
    // "[6] And I am sure ... [7] It is right ..." -> [{n, text}]
    const verses = [...text.matchAll(/\[(\d+)\]\s*([^\[]*)/g)].map((m) => ({ n: +m[1], text: m[2].trim() }));
    out.push({ ref: j.canonical || ref, verses });
  }
  return new Response(JSON.stringify({ passages: out }), { headers });
};

export const config = { path: '/api/esv' };
