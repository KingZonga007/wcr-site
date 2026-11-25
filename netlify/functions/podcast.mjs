// Read-only access to West Coast Revival's own podcast audio for the internal
// transcription tool (/tools/transcribe/). Only enclosures listed in our own
// podcast RSS feed can be fetched, so this is not an open proxy.
//   /api/podcast?list=1                 -> [{i, title, date, url, length}]
//   /api/podcast?i=<index>&start=&end=  -> that byte range of item i's audio
const FEED = 'https://anchor.fm/s/10d3ef9dc/podcast/rss';
let cache = { at: 0, items: [] };
async function items() {
  if (Date.now() - cache.at < 10 * 60 * 1000 && cache.items.length) return cache.items;
  const xml = await (await fetch(FEED)).text();
  const out = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const it = m[1];
    const pick = (re) => (it.match(re) || [])[1] || '';
    out.push({
      i: out.length,
      title: pick(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/).trim(),
      date: pick(/<pubDate>([^<]*)<\/pubDate>/),
      url: pick(/<enclosure[^>]*url="([^"]+)"/).replace(/&amp;/g, '&'),
      length: Number(pick(/<enclosure[^>]*length="(\d+)"/)) || null,
      duration: pick(/<itunes:duration>([^<]*)<\/itunes:duration>/),
    });
  }
  cache = { at: Date.now(), items: out };
  return out;
}
export default async (req) => {
  const p = new URL(req.url).searchParams;
  const noStore = { 'cache-control': 'no-store' };
  const list = await items();
  if (p.get('list')) return Response.json(list, { headers: noStore });
  const it = list[Number(p.get('i'))];
  if (!it || !it.url) return new Response('not found', { status: 404, headers: noStore });
  const start = Math.max(0, Number(p.get('start') || 0));
  const end = Math.min(Number(p.get('end') || start + 4_000_000), start + 5_000_000);
  const r = await fetch(it.url, { headers: { range: `bytes=${start}-${end - 1}` }, redirect: 'follow' });
  return new Response(r.body, { status: r.status, headers: { ...noStore, 'content-type': 'audio/mpeg', 'x-total': r.headers.get('content-range')?.split('/')[1] || '' } });
};
export const config = { path: '/api/podcast' };
