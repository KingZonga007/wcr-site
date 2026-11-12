# West Coast Revival website

Static Astro site. Content lives in files:

- `content/songs.csv`: master song list (source). Run `python3 scripts/build_songs.py content/songs.csv src/data/songs.json` after editing.
- `src/data/songs.json`: one entry per song (charts, lyrics, story, links).
- `src/data/episodes.json`: Worship Is Warfare episodes (to be generated from the podcast feed and YouTube).
- `public/img/`: optimized photos. `public/charts/`: chart PDFs (to come).

Deploys on Netlify from the main branch. Design spec: see the WCR Website Design Spec doc.

## Chord chart rules (from Ryan)

- Every song gets two core charts: recording key and congregational key.
- A PDF marked both "Congregation" and "Recording" goes on both buttons. A PDF marked neither also goes on both buttons.
- A PDF with "Capo" in its file name or title goes in `charts.extras` as a guitar chart, labeled "Guitar chart (KEY, capo N)".
- Anything from SongSelect: remove the SongSelect logo and the CCLI song number, CCLI license number and "For use solely with SongSelect" lines. Keep the copyright line. Use `scripts/transpose_chart.py IN OUT KEY KEY --clean`.
- New keys: `scripts/transpose_chart.py IN OUT FROM TO --clean` keeps the original layout. No approval needed: publish transposed charts directly.
- Files live in `public/charts/` as `<slug>-<KEY>.pdf` (guitar: `<slug>-<KEY>-capo-<N>.pdf`).
- Unreleased songs: set `"unreleased": true` and `"source": "manual"` in songs.json. Charts are downloadable; listen buttons show "coming soon" until the release script finds the song.
- Featured order (Songs page default view and the home page's first six) is `src/data/featured.json`.

## Email list

Build spec: `docs/emailer-v1-spec.md`. Signup capture and sending live in `netlify/functions/`, `email/`, and `scripts/email/`. Campaigns and sequence content are markdown files in `emails/campaigns/` and `emails/sequences/`.

Needs `DATABASE_URL`, `EMAIL_API_KEY`, `TOKEN_SECRET`, `WEBHOOK_SECRET` set locally (and on Netlify / in GitHub secrets) to run. Admin commands, run locally:

```bash
node scripts/email/stats.mjs                  # subscriber counts by status and tag
node scripts/email/export.mjs [path.csv]       # CSV of active subscribers
node scripts/email/send-test.mjs <campaign-id> # send one campaign to TEST_RECIPIENTS now
node scripts/email/cancel.mjs <campaign-id>    # cancel a scheduled campaign
node scripts/email/delete.mjs <email>          # remove a subscriber and their history
node scripts/email/send-due.mjs --dry-run      # preview what the campaign cron would send
```

### Writing an email

Plain Markdown plus a few extras. `emails/examples/formatting-example.md` shows every option.

```markdown
---
subject: "New single: Solid Rock"
preheader: "Free chord charts in two keys"
eyebrow: "New music"                 # small label above the body
hero: /img/email/band.jpg            # full-width photo at the top (optional)
hero_alt: "West Coast Revival live"
hero_link: https://westcoastrevival.org/songs
segment: test                        # all | musician | wiw_reminders | chart_waitlist | test
send_at: 2026-12-01T09:00:00-07:00
---
Paragraphs, **bold**, *italics*, [links](https://westcoastrevival.org), ## headings, lists, ---

[![Alt text](/img/email/wiw-live.jpg)](https://westcoastrevival.org/worship-is-warfare)
![Portrait](/img/email/brothers.jpg "medium")     # or "small"; default is full width

[Get the charts](https://westcoastrevival.org/songs){button}   # one line: centered button
[Watch live](https://...){button}                               # 2+ lines in a row: button grid
[Listen](https://...){button}

::: note
A dark panel: headings, text, links and buttons all work inside.
:::

::: verse
Scripture, centered in italics.
:::
```

Photos for email must be JPGs in `public/img/email/` (Outlook can't show .webp): `python3 scripts/email/prep_image.py public/img/band-best-1600.webp band`. Preview before sending: `node scripts/email/preview.mjs <file.md> --screenshot` (writes HTML, text and PNGs to a temp folder and prints the paths).

### Automatic emails

`scripts/email/send-triggered.mjs` runs every 15 minutes (after `send-due.mjs`) and sends these on its own. Wording lives in `emails/templates/`.

- **Worship Is Warfare episode** (`wiw-episode.md`): once a new episode in `src/data/episodes.json` has its replay up on YouTube, to "Remind me" subscribers (`wiw_reminders`). Waits while a stream is upcoming or live.
- **Weekly digest** (`wiw-digest.md`): Saturdays after 7:30am Arizona time, the week's episodes, to everyone else.
- **New video** (`new-video.md`): music and lyric videos (title says "Official Video", "Lyric Video", "Lyrics", "Music Video" or "Visualizer"), to everyone. Shorts are skipped.

Only episodes and videos from the last few days are considered, so nothing old is ever emailed. Each is recorded in the `campaigns` table, so it's sent once. `--dry-run` prints what it would do.

### Release campaigns

5 emails at R-10, R-6, R-2, release day and R+5 (Arizona time), all subscribers:

```bash
python3 scripts/email/prep_image.py path/to/cover-art.jpg solid-rock
node scripts/email/new-release.mjs --slug solid-rock --title "Solid Rock" --date 2026-12-05 --cover /img/email/solid-rock.jpg --presave https://...
```

This drafts 5 files in `emails/campaigns/` from `emails/templates/release/`. Fill every `[WRITE: ...]` slot (nothing with a slot left will send), preview, `send-test`, then merge. From R-10 through R+5 everything else is quiet: episode emails and the digest are skipped, video alerts are held until R+6 (the released song's own video is skipped). Release emails ignore the one-per-3-days limit but count toward it, so avoid scheduling other campaigns that week.

`scripts/email/import-netlify-forms.mjs` is a one-time script to pull old Netlify Forms "signup" submissions in as pending subscribers (needs a `NETLIFY_AUTH_TOKEN` and `NETLIFY_SITE_ID`, see the script's header comment).
