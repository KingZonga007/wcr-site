// Runs after astro build: writes dist/_redirects = public/_redirects + 301s from the old
// /worship-is-warfare/ URLs (and episode slugs) to the current /devotionals/ pages.
import fs from 'node:fs';
import { pageSlug } from '../src/lib/slug.mjs';
const eps = JSON.parse(fs.readFileSync('src/data/episodes.json', 'utf8'));
const dir = 'src/data/devotionals';
const devs = Object.fromEntries(fs.readdirSync(dir).map((f) => JSON.parse(fs.readFileSync(`${dir}/${f}`, 'utf8'))).filter((d) => d.status === 'published').map((d) => [d.number, d]));
const lines = ['/worship-is-warfare /devotionals/ 301', '/worship-is-warfare/ /devotionals/ 301', '/morning-devotional /devotionals/ 301', '/morning-devotional/ /devotionals/ 301'];
for (const e of eps) {
  const to = `/devotionals/${pageSlug(e, devs[e.number])}/`;
  for (const from of new Set([`/worship-is-warfare/${e.slug}`, `/devotionals/${e.slug}`])) {
    if (from + '/' === to) continue;
    lines.push(`${from} ${to} 301`, `${from}/ ${to} 301`);
  }
}
lines.push('/worship-is-warfare/draft/* /devotionals/draft/:splat 301');
const base = fs.existsSync('public/_redirects') ? fs.readFileSync('public/_redirects', 'utf8').trimEnd() + '\n' : '';
fs.writeFileSync('dist/_redirects', base + lines.join('\n') + '\n');
console.log(`_redirects: ${lines.length} devotional redirects`);
