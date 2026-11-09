# West Coast Revival website

Static Astro site. Content lives in files:

- `content/songs.csv`: master song list (source). Run `python3 scripts/build_songs.py content/songs.csv src/data/songs.json` after editing.
- `src/data/songs.json`: one entry per song (charts, lyrics, story, links).
- `src/data/episodes.json`: Worship Is Warfare episodes (to be generated from the podcast feed and YouTube).
- `public/img/`: optimized photos. `public/charts/`: chart PDFs (to come).

Deploys on Netlify from the main branch. Design spec: see the WCR Website Design Spec doc.

## Chord chart rules (from Ryan)

- Every song gets two core charts: recording key and congregational key.
- A PDF marked both "Congregation" and "Recording" goes on both buttons.
- A PDF with "Capo" in its file name or title goes in `charts.extras` as a guitar chart, labeled "Guitar chart (KEY, capo N)".
- Anything from SongSelect: remove the SongSelect logo and the CCLI song number, CCLI license number and "For use solely with SongSelect" lines. Keep the copyright line. Use `scripts/transpose_chart.py IN OUT KEY KEY --clean`.
- New keys: `scripts/transpose_chart.py IN OUT FROM TO --clean` keeps the original layout. Send the result to Ryan for approval before publishing.
- Files live in `public/charts/` as `<slug>-<KEY>.pdf` (guitar: `<slug>-<KEY>-capo-<N>.pdf`).
- Featured order (Songs page default view and the home page's first six) is `src/data/featured.json`.
