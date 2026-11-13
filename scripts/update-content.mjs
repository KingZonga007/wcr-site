#!/usr/bin/env node
/**
 * Keeps the site's data fresh. Runs on a schedule in GitHub Actions (see
 * .github/workflows/update-content.yml); a commit triggers a Netlify rebuild.
 *
 *  1. Worship Is Warfare: reads the YouTube channel feed, adds new episodes
 *     (title, date, video, songs sung, Scripture) to src/data/episodes.json.
 *  2. Releases: checks Apple Music's public catalog (iTunes Search API, no key)
 *     and, if SPOTIFY_CLIENT_ID/SECRET are set, Spotify. Gets every-platform links
 *     from song.link (Odesli). Updates src/data/releases.json and the listen
 *     links on matching songs in src/data/songs.json; adds new songs it finds.
 *
 * Usage:
 *   node scripts/update-content.mjs            # live run (needs network)
 *   node scripts/update-content.mjs --seed scripts/episodes_seed.json   # offline episode import
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'src/data');
const CONFIG = {
  youtubeChannelId: 'UCn1AwCv0hHtSCm_ThfT8LQw',
  spotifyArtistId: '5K4EsfuyB0ltAeK7GmxLT5',
  artistName: 'West Coast Revival',
};

const readJSON = (f, d) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : d);
const writeJSON = (f, v) => {
  const next = JSON.stringify(v, null, 2) + '\n';
  if (fs.existsSync(f) && fs.readFileSync(f, 'utf8') === next) return false;
  fs.writeFileSync(f, next);
  return true;
};
const norm = (s) => s.toLowerCase().replace(/&#39;|['’]/g, '').replace(/[^a-z0-9]+/g, '');
const slugify = (s) => s.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const decode = (s) => s.replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"');

// ---------- Song matching ----------
const key = (s) => norm(s).replace(/^the/, '');
export function matchSong(name, songs) {
  const n = key(name);
  if (n.length < 4) return null;
  let hit = songs.find((s) => key(s.title) === n);
  if (!hit) hit = songs.find((s) => { const t = key(s.title); return t.length >= 6 && (n.startsWith(t) || t.startsWith(n)) && Math.min(n.length, t.length) >= 6; });
  return hit || null;
}

// ---------- Episodes ----------
const SCRIPTURE = /^(?:[1-3]\s)?[A-Z][a-z]+(?:\s(?:of\s)?[A-Z][a-z]+)*\s\d+(?::\d+(?:-\d+)?)?/;

export function parseEpisode(youtubeId, date, rawTitle, description, songs) {
  const title0 = decode(rawTitle).trim();
  const restream = /^\(restream\)/i.test(title0);
  const num = Number((title0.match(/#\s?(\d+)\s*$/) || [])[1]);
  if (!num) return null;
  const parts = title0.replace(/^\(restream\)\s*/i, '').split('|').map((s) => s.trim());
  const deepDive = /friday deep dive/i.test(title0);
  const title = parts.filter((p) => !/worship is warfare/i.test(p) && !/friday deep dive/i.test(p)).join(' | ') || `Episode ${num}`;
  const lines = decode(description || '').split('\n').map((l) => l.trim()).filter((l) => l.startsWith('- ')).map((l) => l.slice(2).trim());
  const scripture = [], sung = [];
  // Descriptions alternate: song, Scripture, song, Scripture. Parity decides, so a song
  // named like a passage ("Isaiah 53") stays a song.
  lines.forEach((l, i) => {
    const isScripture = lines.length % 2 === 0 ? i % 2 === 1 : SCRIPTURE.test(l) && !matchSong(l, songs);
    if (isScripture) scripture.push((l.match(SCRIPTURE) || [l])[0]); else sung.push(l);
  });
  const wcr = [...new Set(sung.map((s) => matchSong(s, songs)?.slug).filter(Boolean))];
  if (deepDive) { const m = matchSong(title, songs); if (m && !wcr.includes(m.slug)) wcr.push(m.slug); }
  const summary = lines.length ? null : decode(description || '').split('\n')[0].trim() || null;
  return { number: num, slug: `${num}-${slugify(title)}`, title, date, youtubeId, kind: deepDive ? 'Friday Deep Dive' : 'Live', scripture, sung, songs: wcr, summary, restream };
}

export function mergeEpisodes(existing, incoming) {
  const byNum = new Map(existing.map((e) => [e.number, e]));
  for (const e of incoming) {
    if (!e) continue;
    const cur = byNum.get(e.number);
    // Keep the original airing; a restream never replaces an original.
    if (!cur || (cur.restream && !e.restream) || (!e.restream && !cur.restream && e.date < cur.date)) byNum.set(e.number, e);
  }
  return [...byNum.values()].map(({ restream, ...e }) => e).sort((a, b) => b.number - a.number);
}

async function fetchYouTubeFeed() {
  const xml = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${CONFIG.youtubeChannelId}`).then((r) => r.text());
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(([, e]) => ({
    id: (e.match(/<yt:videoId>([^<]+)/) || [])[1],
    date: ((e.match(/<published>([^<]+)/) || [])[1] || '').slice(0, 10),
    title: (e.match(/<title>([^<]+)/) || [])[1] || '',
    desc: (e.match(/<media:description>([\s\S]*?)<\/media:description>/) || [])[1] || '',
  })).filter((v) => /worship is warfare/i.test(v.title));
}

// ---------- Releases ----------
async function odesli(url) {
  try {
    const r = await fetch(`https://api.song.link/v1-alpha.1/links?userCountry=US&url=${encodeURIComponent(url)}`);
    if (!r.ok) return {};
    const j = await r.json(), p = j.linksByPlatform || {};
    return { spotify: p.spotify?.url, apple: p.appleMusic?.url, youtube: p.youtubeMusic?.url || p.youtube?.url, amazon: p.amazonMusic?.url, songlink: j.pageUrl };
  } catch { return {}; }
}

async function appleCatalog(state) {
  if (!state.appleArtistId) {
    const s = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(CONFIG.artistName)}&entity=musicArtist&limit=10`).then((r) => r.json());
    const cands = s.results.filter((a) => a.artistName.toLowerCase() === CONFIG.artistName.toLowerCase());
    for (const c of cands) {
      const l = await fetch(`https://itunes.apple.com/lookup?id=${c.artistId}&entity=song&limit=200`).then((r) => r.json());
      if (l.results.some((t) => t.trackName && /behold our god|all creatures/i.test(t.trackName))) { state.appleArtistId = c.artistId; break; }
    }
    if (!state.appleArtistId) return [];
  }
  const l = await fetch(`https://itunes.apple.com/lookup?id=${state.appleArtistId}&entity=song&limit=200&sort=recent`).then((r) => r.json());
  // Apple lists a different 1970s band under the same artist page: ignore anything before WCR's first release (2005),
  // and the album intro track.
  const keep = (t) => t.releaseDate && t.releaseDate.slice(0, 4) >= '2005' && !/^intro$/i.test(t.trackName || '');
  return l.results.filter((t) => t.wrapperType === 'track').filter(keep).map((t) => ({
    title: t.trackName.replace(/\s*\((?:live|feat\.[^)]*)\)\s*$/i, ''), fullTitle: t.trackName, album: t.collectionName,
    date: (t.releaseDate || '').slice(0, 10), apple: t.trackViewUrl, artwork: (t.artworkUrl100 || '').replace('100x100', '600x600'),
    single: t.trackCount === 1 || / - single$/i.test(t.collectionName),
  }));
}

async function spotifyReleases() {
  const { SPOTIFY_CLIENT_ID: id, SPOTIFY_CLIENT_SECRET: secret } = process.env;
  if (!id || !secret) return [];
  const tok = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64') },
    body: 'grant_type=client_credentials',
  }).then((r) => r.json());
  const j = await fetch(`https://api.spotify.com/v1/artists/${CONFIG.spotifyArtistId}/albums?include_groups=album,single&market=US&limit=50`, { headers: { Authorization: `Bearer ${tok.access_token}` } }).then((r) => r.json());
  return (j.items || []).map((a) => ({ title: a.name, date: a.release_date, spotify: a.external_urls.spotify, type: a.album_type, artwork: a.images?.[0]?.url }));
}

export async function updateReleases(songs) {
  const relFile = path.join(DATA, 'releases.json');
  const state = readJSON(relFile, { appleArtistId: null, releases: [] });
  const tracks = await appleCatalog(state);
  const sp = await spotifyReleases();
  const before = JSON.stringify([state.releases, state.latest]);
  const known = new Map(state.releases.map((r) => [norm(r.title) + r.date, r]));
  for (const t of tracks) {
    const key = norm(t.title) + t.date;
    if (known.has(key)) continue;
    const links = await odesli(t.apple); // all platforms from the Apple link
    const spMatch = sp.find((s) => norm(s.title) === norm(t.title));
    known.set(key, { ...t, ...links, spotify: links.spotify || spMatch?.spotify || null });
    if (!process.env.NO_SLEEP) await new Promise((r) => setTimeout(r, 7000)); // stay under song.link's free rate limit
  }
  state.releases = [...known.values()].sort((a, b) => b.date.localeCompare(a.date));
  state.latest = state.releases.find((r) => r.single) || state.releases[0] || null;
  // Only touch checkedAt when something real changed: a timestamp-only commit would trigger a
  // Netlify deploy (15 credits) every run and use up the free plan.
  if (JSON.stringify([state.releases, state.latest]) !== before) state.checkedAt = new Date().toISOString();

  // Apply exact links to songs; add any song not on the site yet.
  for (const r of [...state.releases].reverse()) {
    let s = matchSong(r.title, songs);
    if (!s) {
      s = { slug: slugify(r.title), title: r.title, key: null, writers: null, themes: [], ccli: null,
        charts: { recording: null, congregational: null, extras: [] }, lyrics: null, story: null, youtubeId: null,
        recordings: [], year: Number(r.date.slice(0, 4)), firstYear: Number(r.date.slice(0, 4)), publisher: 'West Coast Revival', source: 'auto' };
      songs.push(s);
    }
    const y = Number(r.date.slice(0, 4));
    if (s.unreleased) { delete s.unreleased; s.year = y; s.firstYear = y; }
    if (!s.recordings.some((x) => x.year === y)) s.recordings.push({ year: y, publisher: 'West Coast Revival', album: { title: r.single ? 'Single' : r.album, confidence: 'confirmed' }, version: null, tempo: '' });
    s.year = Math.max(s.year || 0, y);
    s.listen = { spotify: r.spotify || s.listen?.spotify, apple: r.apple || s.listen?.apple, youtube: r.youtube || s.listen?.youtube, amazon: r.amazon || s.listen?.amazon, songlink: r.songlink, exact: true };
  }
  songs.sort((a, b) => b.year - a.year || a.title.localeCompare(b.title));
  return { state, relFile };
}

// ---------- Main ----------
async function main() {
  const songsFile = path.join(DATA, 'songs.json');
  const epFile = path.join(DATA, 'episodes.json');
  const songs = readJSON(songsFile, []);
  let episodes = readJSON(epFile, []).filter((e) => e.youtubeId); // drop pre-YouTube sample entries
  const changed = [];

  const seedIdx = process.argv.indexOf('--seed');
  if (seedIdx > -1) {
    const seed = readJSON(process.argv[seedIdx + 1], []);
    episodes = mergeEpisodes(episodes, seed.map(([id, date, title, desc]) => parseEpisode(id, date, title, desc, songs)));
  } else {
    try {
      const feed = await fetchYouTubeFeed();
      episodes = mergeEpisodes(episodes, feed.map((v) => parseEpisode(v.id, v.date, v.title, v.desc, songs)));
    } catch (e) { console.error('YouTube feed failed:', e.message); }
    try {
      const { state, relFile } = await updateReleases(songs);
      if (writeJSON(relFile, state)) changed.push('releases');
      if (writeJSON(songsFile, songs)) changed.push('songs');
    } catch (e) { console.error('Release check failed:', e.message); }
  }
  if (writeJSON(epFile, episodes)) changed.push('episodes');
  console.log(changed.length ? `Updated: ${changed.join(', ')}` : 'No changes');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
