import { loadCampaignFiles } from './content.mjs';

// All WCR scheduling is in Arizona time, which has no daylight saving: UTC-7.
const PHOENIX_OFFSET_MS = -7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
export const WINDOW_BEFORE_DAYS = 10;
export const WINDOW_AFTER_DAYS = 5;

// 'YYYY-MM-DD' for a moment, as a calendar date in Arizona.
export function phoenixDate(when = new Date()) {
  return new Date(when.getTime() + PHOENIX_OFFSET_MS).toISOString().slice(0, 10);
}

// The moment a given Arizona date and time happen.
export function phoenixTime(dateStr, hh = 0, mm = 0) {
  return new Date(Date.parse(`${dateStr}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00-07:00`));
}

export function addDays(dateStr, n) {
  return new Date(Date.parse(`${dateStr}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

// Releases are declared by the release campaign files themselves (frontmatter
// `release`, `release_title`, `release_date`), so there's nothing to keep in sync.
export function loadReleases(files = loadCampaignFiles()) {
  const bySlug = new Map();
  for (const f of files) {
    const { release, release_title: title, release_date: date } = f.meta || {};
    if (!release || !date) continue;
    const d = date instanceof Date ? date.toISOString().slice(0, 10) : String(date);
    if (!bySlug.has(release)) bySlug.set(release, { slug: release, title: title || release, date: d });
  }
  return [...bySlug.values()].map((r) => ({
    ...r,
    start: phoenixTime(addDays(r.date, -WINDOW_BEFORE_DAYS)),
    end: phoenixTime(addDays(r.date, WINDOW_AFTER_DAYS + 1)), // through the end of R+5
  }));
}

// The release campaign whose quiet window (R-10 through R+5) contains `when`.
export function releaseWindowAt(when = new Date(), releases = loadReleases()) {
  return releases.find((r) => when >= r.start && when < r.end) || null;
}

export function normTitle(s) {
  return String(s || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim();
}
