# West Coast Revival website

Static Astro site. Content lives in files:

- `content/songs.csv`: master song list (source). Run `python3 scripts/build_songs.py content/songs.csv src/data/songs.json` after editing.
- `src/data/songs.json`: one entry per song (charts, lyrics, story, links).
- `src/data/episodes.json`: Worship Is Warfare episodes (to be generated from the podcast feed and YouTube).
- `public/img/`: optimized photos. `public/charts/`: chart PDFs (to come).

Deploys on Netlify from the main branch. Design spec: see the WCR Website Design Spec doc.
