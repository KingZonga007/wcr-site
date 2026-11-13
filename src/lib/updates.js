// A dated feed of what's new on the site, built from the data the content job keeps current.
import episodes from '../data/episodes.json';
import releases from '../data/releases.json';
import songs from '../data/songs.json';
import { songUrl } from './songs.js';

const slugFor = (title) => {
  const n = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const s = songs.find((x) => n(x.title) === n(title));
  return s ? songUrl(s) : null;
};

export function updates(limit = 30) {
  const eps = episodes.map((e) => ({
    date: e.date,
    kind: 'Worship Is Warfare',
    title: `Episode ${e.number}: ${e.title}`,
    text: [e.scripture.length ? `Scripture: ${e.scripture.join(', ')}` : '', e.sung.length ? `Songs: ${e.sung.join(', ')}` : ''].filter(Boolean).join('. '),
    href: `/worship-is-warfare/${e.slug}`,
  }));
  const seen = new Set();
  const rel = (releases.releases || [])
    .filter((r) => r.single && r.date >= '2019')
    .filter((r) => (seen.has(r.title) ? false : seen.add(r.title)))
    .map((r) => ({ date: r.date, kind: 'New release', title: r.title, text: 'Out now on Spotify, Apple Music, YouTube and Amazon Music.', href: slugFor(r.title) || '/songs#discography' }));
  return [...eps, ...rel].sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit);
}

export const fmtDate = (d) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
