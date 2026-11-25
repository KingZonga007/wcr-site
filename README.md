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
- When the recording and congregational charts are the same file, the page shows only the congregational card. Ryan says when a recording key differs.
- Alternate arrangements go in `charts.extras` with a `description`; they show as cards under "Alternate arrangements". A chart that changes key gets `"modulatesTo": "D"`.
- WCR copyright (every upload): songs with Publisher = WCR on the WCR Master Song List get `"wcrCopyrightYear"` (year of first release; unreleased songs use the current year). SGM songs and covers (e.g. Solid Rock) do not. After adding or replacing charts, run `python3 scripts/stamp-charts.py`. It adds "© YEAR West Coast Revival Music (ASCAP). Administered worldwide by Songtrust. All rights reserved." to any WCR chart missing it, replacing a short "© YEAR West Coast Revival Music" line in place. `--check` reports without changing anything. Song pages show the same line automatically.

## Worship Is Warfare devotionals

Each episode becomes a devotional page: opening scripture, exhortation, prayer, closing scripture, then the video.

- Data: `src/data/devotionals/<number>.json` with `status` (`draft` or `published`), `draftKey`, `title` (from the message, not the song), `speaker`, `opening`, `closing`, `summary`, `exhortation` (paragraphs), `prayer` (paragraphs).
- Drafts render at `/devotionals/draft/<draftKey>/` (noindex, not in the sitemap). Published devotionals replace the episode page at `/devotionals/<reference>-<title>/` (old `/worship-is-warfare/<slug>/` URLs 301 there via `scripts/redirects.mjs`). The H1 shows the opening reference above the title.
- Scripture text loads live from the ESV API through `netlify/functions/esv.mjs` (`/api/esv`, key in Netlify env `ESV_API_KEY`). Nothing is stored, so the site-wide 500-verse cap does not apply to devotionals.
- Editing rules (from Ryan): light cleanup only. Keep the speaker's words and voice; fix transcription errors, drop filler and repeats, add paragraphs. Byline is whoever gave the exhortation (Ryan Baird or Jonathan Baird). Skip Friday Deep Dives and restreams.
- New episodes: draft, send Ryan the draft link, publish on his approval. The backfill of past episodes was approved after a 5-episode spot-check.
- An episode is added to `src/data/episodes.json` only when its devotional is ready, so no thin episode pages go live.
