# Morning Devotional workflow (Tue/Thu)

Every Tuesday and Thursday livestream becomes a devotional page. Claude drafts it, Ryan approves it, then it is published.
Friday Deep Dives and restreams are skipped.

## 1. Find the new episode
- The GitHub Action (`.github/workflows/update-content.yml`) adds new YouTube episodes to `src/data/episodes.json` every 2 hours. `git pull` first.
- The new episode is the highest `number` in `episodes.json` with no file in `src/data/devotionals/`.
- If it is a Friday Deep Dive or a restream, stop.

## 2. Transcript and speaker (built-in browser on Ryan's computer)
- Open `https://westcoastrevival.org/tools/transcribe/` in the built-in browser. It is an internal noindex page.
- `await wcr.list()` lists the podcast items. Find the item whose title has `#<number>`. Its index is `i`.
- Use the transcript: `await wcr.transcribe(i, 0, wcr.secs(item.duration), {device:'webgpu', dtype:{encoder_model:'fp32', decoder_model_merged:'q4'}})`. If WebGPU fails, omit the options to fall back to wasm. Return `r.text`. Long calls can time out after 45s, so run the transcription in the background, save the result to `localStorage`, and read it later.
- The podcast is usually posted about 7:45 to 8:45am MST. If the item isn't there yet, use the YouTube transcript (Show transcript on the watch page) or try again later.
- To identify the speaker:
  - Find the exhortation. It ends at the first "let's sing" / "let's worship" after the opening reading.
  - Call `await wcr.embed(i, end - 53, end - 8)`.
  - Take the dot product with each centroid in `localStorage['wcr-centroids']` on westcoastrevival.org in the built-in browser (`{J:[...], R:[...]}`, unit vectors). The larger one wins.
  - If that key is missing, rebuild it. Embed the anchor episodes the same way: Jonathan 154, 155, 143, 138, 90, 89, 11, 98; Ryan 79, 99, 111, 121, 68. Average each set and normalize it.
  - If the margin is under 0.1, leave `speaker` null and say so in the message to Ryan.

## 3. Write the draft
- Format the devotional:
  - `opening`: the first scripture read, as an ESV reference.
  - `exhortation`: light cleanup only. Remove filler and false starts, fix references, and keep the speaker's voice. Paraphrase quotes from TV, film or books instead of copying them. Remove the names of private people.
  - `prayer`: the closing prayer, also with light cleanup.
  - `closing`: the closing scripture.
  - `title`: from the message, not the song. Do not reuse an existing title.
  - `summary`: one or two sentences.
  - `speaker`: "Ryan Baird" or "Jonathan Baird".
- Save the batch JSON and run `python3 scripts/add-devotional.py batch.json`. The status defaults to `draft`.
- Run `npm run build && python3 scripts/adgrants-audit.py`, then commit and push.
- The draft preview is `https://westcoastrevival.org/devotionals/draft/<draftKey>/`. It is noindex and not in the sitemap.

## 4. Ask Ryan
- Send Ryan the preview link and a push notification: "Devotional #N draft ready: <title>. Approve or send edits."
- Make any edits he asks for. Re-running the script keeps the same `draftKey`.

## 5. Publish (only after Ryan approves)
- Set `"status": "published"` in `src/data/devotionals/<n>.json`, delete the `episode` key if present, build, audit, commit and push.
- The page goes live at `/devotionals/<opening-reference>-<title>/`. The old `/worship-is-warfare/` URL redirects to it automatically (`scripts/redirects.mjs`).

## Rules
- ESV text is fetched live from `/api/esv` and is never stored in the repo.
- Copy rules: tight, no em dashes, minimal flourishes.
