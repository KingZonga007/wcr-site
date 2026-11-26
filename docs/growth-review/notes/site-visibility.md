# site-visibility notes

Newest entries at the bottom. Each entry: date, best-practice changes found (with links), what was checked, what to recheck next run.

## 2026-11-26 (first run)

Best-practice refresh: not completed. Primary sources (Search Central, web.dev) were not fetched; one web search returned only secondary sources. Do a full refresh next run and record dated links here.

Checked:
- `npm run build` OK (176 pages, 543 devotional redirects). `npm run audit` 38/39: H2 FAIL, draft #156 has no ESV text for Luke 6:38 and Isaiah 55:1-3 (src/data/scripture-esv.json). Draft only, but audit exits 1.
- Live site (curl, WebFetch) and PageSpeed API blocked by the session proxy/permissions. No live check, no CWV numbers this run. Search Console not opened by me; used snapshot figures.
- Drafts: src/pages/devotionals/draft/[key].astro sets noindex,nofollow, excluded from sitemap; /worship-is-warfare/draft/* 301s to /devotionals/draft/:splat. Draft 130 is no longer built, so that old URL now ends in a 404 (fine). GA4 still loads on draft pages, so team previews count as visits.
- Charts: no gate in current code. Song pages link PDFs directly with `download` and fire chart_download on click. "chart-gate:..." is not in the repo (clone is shallow, 50 commits); it is a utm_source on an inbound link, most likely an email.
- Trailing slashes: canonicals and sitemap use trailing slash; every internal link (href() in src/lib/site.js) and JSON-LD url omits it (e.g. 9 x href="/invite" on home). Explains /privacy and /invite in Search Console. Need live `curl -I` to see whether Netlify 301s or serves 200.
- /christmas/ (src/pages/christmas.astro): only one Christmas chart exists (We Three Kings). Grace has no chart. Hero CTA goes to /songs/we-three-kings#charts, not to the PDF. No pages for Silent Night, O Holy Night, etc.
- /songs/behold-our-god/ and /songs/all-creatures-of-our-god-and-king/: good titles ("X Chords and Lyrics (Free PDF Chart)"), descriptions, canonical, MusicRecording JSON-LD, lyrics, linked from home, /songs and /christmas. 0 views is the hero campaign having 0 impressions, not a page problem.
- Devotionals: 137 with VideoObject, PodcastEpisode, Article JSON-LD.
- robots.txt allows all except /tools/; sitemap 171 URLs = audit's indexable count.

Recheck next run:
- Live: curl -I /privacy, /invite, /songs/we-three-kings (301 or 200?). PSI mobile on home, /devotionals/, one devotional, /songs/we-three-kings/.
- /christmas/ views to key events (23 views, 0 key events this week).
- chart_download per paid session (5 from 2 users on 44 paid sessions).
- Search Console: /songs/house-of-the-lord/ position for "house of the lord chords" (0/10 impressions to date); whether GA4 link was made.
- Audit H2 once #156 is published.
