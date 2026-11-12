#!/usr/bin/env node
// Runs every 15 minutes from GitHub Actions, after send-due.mjs. Sends the
// automatic emails:
//   - a Worship Is Warfare episode email to 'Remind me' subscribers once each
//     new replay is up (from src/data/episodes.json, kept fresh by update-content)
//   - a Saturday-morning digest of the week's episodes to everyone else
//   - a new-video alert to everyone for music and lyric videos (no Shorts)
// During a release campaign's quiet window (R-10 through R+5) episode emails
// and the digest are skipped, and video alerts are held until R+6, except the
// released song's own video, which the release emails already cover.
//
// Each email is recorded in `campaigns` the first time it's seen (scheduled,
// held, or canceled), so a re-run never sends anything twice. Only episodes and
// videos from the last few days are considered, so the first run doesn't email
// the back catalog. --dry-run prints decisions and changes nothing.
import { query, closePool } from '../../email/lib/db.mjs';
import { claimCampaign, deliverCampaign } from '../../email/lib/campaignSender.mjs';
import { loadReleases, releaseWindowAt, phoenixDate, phoenixTime, addDays, normTitle, WINDOW_AFTER_DAYS } from '../../email/lib/releases.mjs';
import {
  readJSON, buildEpisodeEmail, buildDigestEmail, buildVideoEmail,
  fetchChannelFeed, isMusicVideoTitle, videoStatus, isShort, thumbnailFor,
} from '../../email/lib/triggered.mjs';

const DRY_RUN = process.argv.includes('--dry-run');
const EPISODE_MAX_AGE_DAYS = 2;
const VIDEO_MAX_AGE_DAYS = 3;
const DIGEST_TIME = [7, 30]; // Saturday, Arizona time
const SEND_HOUR_AFTER_WINDOW = [7, 30];
const WIW_FALLBACK_IMAGE = '/img/email/wiw-live.jpg';

async function exists(id) {
  const { rows } = await query('select 1 from campaigns where id = $1', [id]);
  return rows.length > 0;
}

async function record({ id, kind, ref, segment, sendAt = new Date(), status = 'scheduled', email, reason }) {
  const note = status === 'canceled' ? `skipped (${reason})` : sendAt > new Date() ? `held until ${sendAt.toISOString()}` : 'scheduled now';
  console.log(`${DRY_RUN ? '[dry run] ' : ''}${id}: ${note}${email ? ` - "${email.subject}"` : ''}`);
  if (DRY_RUN) return;
  await query(
    `insert into campaigns (id, subject, segment, send_at, status, kind, ref, content)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     on conflict (id) do nothing`,
    [id, email?.subject || reason || id, segment, sendAt, status, kind, String(ref), email ? JSON.stringify({ body: email.body, meta: email.meta }) : null]
  );
}

async function detectEpisodes({ today, window, episodes, songs }) {
  const recent = episodes.filter((e) => e.youtubeId && e.date >= addDays(today, -EPISODE_MAX_AGE_DAYS));
  for (const ep of recent) {
    const id = `wiw-episode-${ep.number}`;
    if (await exists(id)) continue;
    if (window) {
      await record({ id, kind: 'wiw_episode', ref: ep.number, segment: 'wiw_reminders', status: 'canceled', reason: `release window: ${window.slug}` });
      continue;
    }
    const status = await videoStatus(ep.youtubeId);
    if (status !== 'available') {
      console.log(`${id}: still ${status}, will check again next run`);
      continue;
    }
    const thumb = await thumbnailFor(ep.youtubeId, WIW_FALLBACK_IMAGE);
    await record({ id, kind: 'wiw_episode', ref: ep.number, segment: 'wiw_reminders', email: buildEpisodeEmail(ep, songs, thumb) });
  }
}

async function detectVideos({ today, window }) {
  let feed;
  try {
    feed = await fetchChannelFeed();
  } catch (err) {
    console.error('YouTube feed failed:', err.message);
    return;
  }
  const recent = feed.filter((v) => v.id && v.date >= addDays(today, -VIDEO_MAX_AGE_DAYS) && isMusicVideoTitle(v.title));
  for (const v of recent) {
    const id = `video-${v.id}`;
    if (await exists(id)) continue;
    if (await isShort(v.id)) {
      await record({ id, kind: 'video', ref: v.id, segment: 'all', status: 'canceled', reason: 'YouTube Short' });
      continue;
    }
    const status = await videoStatus(v.id);
    if (status !== 'available') {
      console.log(`${id}: still ${status}, will check again next run`);
      continue;
    }
    const email = buildVideoEmail(v, await thumbnailFor(v.id));
    if (window) {
      if (normTitle(v.title).includes(normTitle(window.title))) {
        await record({ id, kind: 'video', ref: v.id, segment: 'all', status: 'canceled', reason: `video for ${window.title}, covered by the release emails` });
      } else {
        const after = phoenixTime(addDays(window.date, WINDOW_AFTER_DAYS + 1), ...SEND_HOUR_AFTER_WINDOW);
        await record({ id, kind: 'video', ref: v.id, segment: 'all', sendAt: after, email });
      }
      continue;
    }
    await record({ id, kind: 'video', ref: v.id, segment: 'all', email });
  }
}

async function detectDigest({ now, today, window, episodes }) {
  const isSaturday = new Date(`${today}T12:00:00Z`).getUTCDay() === 6;
  if (!isSaturday || now < phoenixTime(today, ...DIGEST_TIME)) return;
  const id = `wiw-digest-${today}`;
  if (await exists(id)) return;
  if (window) {
    await record({ id, kind: 'wiw_digest', ref: today, segment: 'wiw_digest', status: 'canceled', reason: `release window: ${window.slug}` });
    return;
  }
  const week = episodes
    .filter((e) => e.youtubeId && e.date >= addDays(today, -6) && e.date <= today)
    .sort((a, b) => a.date.localeCompare(b.date) || a.number - b.number);
  if (!week.length) {
    await record({ id, kind: 'wiw_digest', ref: today, segment: 'wiw_digest', status: 'canceled', reason: 'no episodes this week' });
    return;
  }
  const thumbs = {};
  for (const ep of week) thumbs[ep.youtubeId] = await thumbnailFor(ep.youtubeId, WIW_FALLBACK_IMAGE);
  await record({ id, kind: 'wiw_digest', ref: today, segment: 'wiw_digest', email: buildDigestEmail(week, thumbs) });
}

async function sendDue() {
  const { rows } = await query(
    `select * from campaigns where kind in ('wiw_episode', 'wiw_digest', 'video')
       and status in ('scheduled', 'sending') and send_at <= now() order by send_at`
  );
  for (const c of rows) {
    if (!(await claimCampaign(c))) continue;
    await deliverCampaign(c, c.content || {});
  }
}

async function main() {
  const now = process.env.EMAIL_NOW ? new Date(process.env.EMAIL_NOW) : new Date(); // EMAIL_NOW: tests only
  const today = phoenixDate(now);
  const releases = loadReleases();
  const window = releaseWindowAt(now, releases);
  const episodes = readJSON('src/data/episodes.json', []);
  const songs = readJSON('src/data/songs.json', []);
  if (window) console.log(`In the quiet window for "${window.title}" (release ${window.date}).`);

  await detectEpisodes({ today, window, episodes, songs });
  await detectVideos({ today, window });
  await detectDigest({ now, today, window, episodes });
  if (!DRY_RUN) await sendDue();
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(closePool);
