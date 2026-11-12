#!/usr/bin/env node
// Drafts the 5-email release campaign from emails/templates/release/.
//
//   node scripts/email/new-release.mjs --slug solid-rock --title "Solid Rock" \
//     --date 2026-12-05 --cover /img/email/solid-rock.jpg --presave https://...
//
// Writes 5 files to emails/campaigns/ dated R-10, R-6, R-2, R and R+5 (Arizona
// time). They still contain [WRITE: ...] slots for the song-specific copy;
// send-due refuses to send anything with an unfilled slot. Make the cover JPG
// first: python3 scripts/email/prep_image.py <art> <slug>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import { fillTemplate } from '../../email/lib/fill.mjs';
import { addDays } from '../../email/lib/releases.mjs';
import { CONFIG } from '../../email/lib/config.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TEMPLATES = path.join(REPO, 'emails', 'templates', 'release');
const CAMPAIGNS = path.join(REPO, 'emails', 'campaigns');

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function main() {
  const slug = arg('slug');
  const title = arg('title');
  const date = arg('date');
  const cover = arg('cover');
  const presave = arg('presave');
  if (!slug || !title || !/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !cover) {
    console.error('Usage: node scripts/email/new-release.mjs --slug <slug> --title "<Title>" --date YYYY-MM-DD --cover /img/email/<file>.jpg [--presave <url>]');
    process.exitCode = 1;
    return;
  }
  if (cover.startsWith('/') && !fs.existsSync(path.join(REPO, 'public', cover))) {
    console.error(`Cover not found at public${cover}. Run: python3 scripts/email/prep_image.py <art> ${slug}`);
    process.exitCode = 1;
    return;
  }

  const day = new Date(`${date}T12:00:00Z`);
  const vars = {
    title,
    slug,
    cover,
    presave_url: presave,
    song_url: `${CONFIG.siteUrl}/songs/${slug}`,
    release_date: day.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' }),
    release_day: day.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }),
  };
  vars.announce_preheader = presave
    ? "Pre-save it now and it'll be in your library the day it's out."
    : `Mark your calendar: out ${vars.release_date}.`;

  const written = [];
  for (const file of fs.readdirSync(TEMPLATES).filter((f) => f.endsWith('.md')).sort()) {
    const { data, content } = matter(fillTemplate(fs.readFileSync(path.join(TEMPLATES, file), 'utf8'), vars));
    const sendDate = addDays(date, Number(data.offset_days));
    const { offset_days, send_time, ...front } = data;
    const out = path.join(CAMPAIGNS, `${sendDate}-${slug}-${file}`);
    if (fs.existsSync(out)) {
      console.error(`${path.relative(REPO, out)} already exists; not overwriting.`);
      process.exitCode = 1;
      continue;
    }
    const frontmatter = {
      ...front,
      segment: 'all',
      send_at: `${sendDate}T${send_time}:00-07:00`,
      release: slug,
      release_title: title,
      release_date: date,
    };
    fs.mkdirSync(CAMPAIGNS, { recursive: true });
    fs.writeFileSync(out, matter.stringify(content, frontmatter));
    written.push(path.relative(REPO, out));
  }
  if (written.length) {
    console.log(`Drafted ${written.length} release emails:\n  ${written.join('\n  ')}`);
    console.log('Fill in every [WRITE: ...] slot, preview each with scripts/email/preview.mjs, then send-test before merging.');
  }
}

main();
