import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import { fillTemplate } from './fill.mjs';
import { CONFIG } from './config.mjs';
import { normTitle } from './releases.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TEMPLATES = path.join(REPO, 'emails', 'templates');

export const MUSIC_VIDEO = /\b(official\s+(music\s+|lyric\s+)?video|lyric\s+video|lyrics|music\s+video|visualizer)\b/i;
const WIW = /worship is warfare/i;

export function readJSON(rel, fallback) {
  try {
    return JSON.parse(fs.readFileSync(path.join(REPO, rel), 'utf8'));
  } catch {
    return fallback;
  }
}

// Template file -> { subject, meta, body }, ready for renderEmail.
export function fromTemplate(name, vars) {
  const { data, content } = matter(fillTemplate(fs.readFileSync(path.join(TEMPLATES, name), 'utf8'), vars));
  const { subject, ...meta } = data;
  return { subject, meta, body: content.trim() };
}

function longDate(dateStr) {
  return new Date(`${dateStr}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
}

// Streams are Tuesday and Thursday; the next one after a given date.
function nextStreamDay(dateStr) {
  const dow = new Date(`${dateStr}T12:00:00Z`).getUTCDay();
  return dow === 2 ? 'Thursday' : 'Tuesday';
}

function songLinks(sung, songs) {
  const bySlug = new Map(songs.map((s) => [normTitle(s.title), s.slug]));
  return sung
    .map((name) => {
      const slug = bySlug.get(normTitle(name));
      return slug ? `[${name}](${CONFIG.siteUrl}/songs/${slug})` : name;
    })
    .join(', ');
}

export function watchUrl(id) {
  return `https://www.youtube.com/watch?v=${id}`;
}

export function buildEpisodeEmail(ep, songs, thumbnail) {
  const show = ep.kind === 'Friday Deep Dive' ? 'Friday Deep Dive' : 'Worship Is Warfare';
  const scripture = (ep.scripture || []).join(', ');
  const sungPlain = (ep.sung || []).join(', ');
  const preheader = [scripture && `Scripture: ${scripture}.`, sungPlain && `Songs: ${sungPlain}.`].filter(Boolean).join(' ') || 'The replay is up.';
  return fromTemplate('wiw-episode.md', {
    show,
    number: ep.number,
    title: ep.title,
    preheader,
    thumbnail,
    watch_url: watchUrl(ep.youtubeId),
    podcast_url: CONFIG.applePodcasts,
    date_long: longDate(ep.date),
    scripture,
    songs: songLinks(ep.sung || [], songs),
    next_stream: nextStreamDay(ep.date),
  });
}

export function buildDigestEmail(episodes, thumbnails) {
  const block = episodes
    .map((ep) => {
      const label = `${ep.kind === 'Friday Deep Dive' ? 'Friday Deep Dive' : ''} #${ep.number}: ${ep.title}`.trim();
      const lines = [
        `[![${label}](${thumbnails[ep.youtubeId]})](${watchUrl(ep.youtubeId)})`,
        '',
        `**${label}**  \n${longDate(ep.date)}${ep.scripture?.length ? `  \nScripture: ${ep.scripture.join(', ')}` : ''}`,
        '',
        `[Watch #${ep.number}](${watchUrl(ep.youtubeId)}){button}`,
      ];
      return lines.join('\n');
    })
    .join('\n\n---\n\n');
  const n = episodes.length;
  return fromTemplate('wiw-digest.md', {
    preheader: `${n} episode${n === 1 ? '' : 's'} this week: ${episodes.map((e) => e.title).join(', ')}.`,
    episodes: block,
    live_url: `${CONFIG.youtubeChannel}/streams`,
  });
}

export function buildVideoEmail(video, thumbnail) {
  return fromTemplate('new-video.md', {
    title: video.title,
    thumbnail,
    watch_url: watchUrl(video.id),
    subscribe_url: `${CONFIG.youtubeChannel}?sub_confirmation=1`,
  });
}

// ---- YouTube helpers. Any network failure falls back to the permissive answer
// so a flaky YouTube response delays nothing and never blocks an email forever.

export async function fetchChannelFeed() {
  const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${CONFIG.youtubeChannelId}`);
  const xml = await res.text();
  const decode = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(([, e]) => ({
    id: (e.match(/<yt:videoId>([^<]+)/) || [])[1],
    date: ((e.match(/<published>([^<]+)/) || [])[1] || '').slice(0, 10),
    title: decode((e.match(/<title>([^<]+)/) || [])[1] || ''),
  }));
}

export function isMusicVideoTitle(title) {
  return !WIW.test(title) && MUSIC_VIDEO.test(title);
}

// 'upcoming' (scheduled, not started), 'live' (streaming now) or 'available'.
export async function videoStatus(id) {
  try {
    const html = await (await fetch(watchUrl(id), { headers: { 'accept-language': 'en-US' } })).text();
    if (/"isUpcoming":true/.test(html)) return 'upcoming';
    if (/"isLiveNow":true/.test(html)) return 'live';
  } catch {}
  return 'available';
}

// YouTube serves /shorts/<id> directly for a Short and redirects for anything else.
export async function isShort(id) {
  try {
    const res = await fetch(`https://www.youtube.com/shorts/${id}`, { method: 'HEAD', redirect: 'manual' });
    return res.status === 200;
  } catch {
    return false;
  }
}

// The full-size thumbnail only exists when the upload has an HD custom one.
export async function thumbnailFor(id, fallback) {
  const maxres = `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`;
  try {
    const res = await fetch(maxres, { method: 'HEAD' });
    if (res.ok) return maxres;
  } catch {}
  return fallback || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}
