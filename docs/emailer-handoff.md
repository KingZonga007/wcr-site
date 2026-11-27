# Emailer handoff (from the cloud Claude Code session, Nov 10 to 27, 2026)

Everything below lives on the branch **`emailer-v1`** of KingZonga007/wcr-site. It is **not merged into `main`**. Read this file first, then the "Email list" section of `README.md` on this branch, then `docs/emailer-v1-spec.md` **on `main`** (it was finalized after this branch started; see "Gaps" below).

```bash
git fetch origin emailer-v1
git log --oneline origin/main..origin/emailer-v1     # the 4 emailer commits
git diff --stat origin/main...origin/emailer-v1      # what the branch adds
git show origin/emailer-v1:docs/emailer-handoff.md   # this file
```

## 1. What's built and tested

Commits on `emailer-v1` (oldest first):

1. `ef6ccee` V1 emailer per the spec: double opt-in, welcome sequence, campaigns, unsubscribe, bounce/complaint webhook, admin scripts, Netlify Forms import, weekly backup.
2. `d1e51c9` Newsletter-style template (modeled on a Mailchimp example Ryan liked): WCR header, hero photo, amber pill buttons and button grids, dark `::: note` panels, `::: verse` Scripture callouts, sized images, social icons footer. Preview and image-prep scripts.
3. `cd03882` Small fixes: no em dash in the confirmation subject, button sizing.
4. `9dcf259` Automatic emails (Worship Is Warfare episode, Saturday digest, new music/lyric video) and the 5-email release campaign, with per-kind cadence rules and release-window pausing.

All of it was tested end to end against a local Postgres (signup, confirm, welcome, unsubscribe incl. one-click POST, bounce webhook with a real Svix signature check, campaigns, sequences, the triggered emails, release windows, idempotent re-runs). Email sending and YouTube were mocked in tests; **nothing has been sent for real** and nothing has run on Netlify yet.

### File map

| Path | What |
|---|---|
| `db/schema.sql` | Tables `subscribers`, `campaigns` (+ `kind`, `ref`, `content` columns), `sends`, `events`. Idempotent; run it once on Neon. |
| `netlify/functions/` | `subscribe`, `confirm`, `unsubscribe`, `email-webhook` (served at `/api/*` via a redirect in `netlify.toml`). |
| `email/lib/` | Shared code: `config`, `db`, `token` (HMAC links), `send` (Resend wrapper), `template` (all email HTML), `campaignSender` (cadence rules per kind), `sequenceRunner`, `triggered` (episode/digest/video builders + YouTube checks), `releases` (Arizona-time windows), `fill` (template placeholders). |
| `emails/sequences/welcome/` | Welcome emails, days 0, 3, 7. |
| `emails/templates/` | Wording for automatic emails (`wiw-episode.md`, `wiw-digest.md`, `new-video.md`) and the release campaign (`release/1..5`). |
| `emails/examples/formatting-example.md` | Every formatting option. Never sent. |
| `emails/campaigns/` | One-off and release campaigns (empty for now). A file here with a past `send_at` sends. |
| `scripts/email/` | `send-due` (campaigns, every 15 min), `send-triggered` (automatic emails, every 15 min), `send-sequences` (daily), `new-release`, `preview`, `prep_image.py`, `send-test`, `stats`, `export`, `cancel`, `delete`, `import-netlify-forms`. |
| `.github/workflows/email-*.yml` | Cron jobs: campaigns + automatic emails every 15 min, sequences daily, DB backup weekly (to a private Actions artifact). |
| `public/img/email/` | Email-safe JPGs and social icon PNGs (Outlook can't show .webp). |

## 2. Decisions Ryan made (don't reopen)

- **Format:** emails are Markdown + `{button}`, `::: note`, `::: verse`, frontmatter `hero`/`eyebrow`. No handwritten signature.
- **WIW episode email:** sent *after* the replay is up (waits while YouTube shows it upcoming or live), automatically, to "Remind me" subscribers (`wiw_reminders` tag).
- **Weekly digest:** Saturdays 7:30am Arizona, the week's episodes, to everyone *except* `wiw_reminders`.
- **New-video email:** music and lyric videos only (title match), no Shorts, to everyone, automatic.
- **Release campaign:** 5 emails at R-10, R-6, R-2, R, R+5 (Arizona time), to everyone, with a pre-save button (Ryan usually has a pre-save link). Ryan gives art and details; Claude runs `new-release.mjs` and writes the `[WRITE: ...]` slots. Nothing with an unfilled slot can send.
- **Release window (R-10 through R+5):** pause everything else. Episode emails and the digest are skipped; other video alerts are held until R+6 7:30am; the released song's own video alert is skipped. Welcome emails still go.
- **Signup promise** changed to "About once a week: new songs, free charts and Worship Is Warfare. Unsubscribe anytime." Reminder-form thank-you text changed to "once the replay is up".
- **Cadence:** regular campaigns respect a one-email-per-3-days guard; release emails ignore it but count toward it; episode/digest/video emails neither respect nor count.

## 3. Setup done outside the repo

- **Resend:** account created. Sending domain `mail.westcoastrevival.org` added and **verified** (domain id `c5c80b68-a018-4de8-8557-dd996b984831`, region us-east-1). Webhook created to `https://westcoastrevival.org/api/email-webhook` for `email.bounced` and `email.complained` (id `94cb48c3-d312-43a1-9e9f-8278ff5fb766`); its signing secret (`whsec_...`) is in the Resend dashboard under Webhooks. **Do not re-add the domain or webhook.**
- **Resend API keys:** "West Coast Revival" (never worked, can be deleted) and "wcr-site" (saved only inside the old cloud session; not retrievable). Create a fresh **Sending access** key scoped to `mail.westcoastrevival.org` for `EMAIL_API_KEY`.
- **Porkbun DNS** (all added and confirmed resolving): `resend._domainkey.mail` TXT (DKIM), `send.mail` MX `feedback-smtp.us-east-1.amazonses.com` prio 10, `send.mail` TXT `v=spf1 include:amazonses.com ~all`, `rsend.mail` CNAME `send.forge.rmta.net`, and `_dmarc` TXT `v=DMARC1; p=none; rua=mailto:info@westcoastrevival.org`. **Warning:** adding the MX once wiped the root forwarding MX records; they were re-added (`fwd1.porkbun.com` 10, `fwd2.porkbun.com` 20) and info@ forwarding was tested working. Never touch root MX/SPF.
- **Not done yet:** Neon project (spec now says: create directly at neon.com, not via Netlify DB), run `db/schema.sql`, Netlify env vars (`DATABASE_URL`, `EMAIL_API_KEY`, `TOKEN_SECRET`, `WEBHOOK_SECRET`, `SITE_URL`), GitHub secrets (`DATABASE_URL`, `EMAIL_API_KEY`, `TOKEN_SECRET`, `TEST_RECIPIENTS`). `TOKEN_SECRET` must be the same value in both places.

## 4. Gaps against the spec on `main` (must build before going live)

`main`'s spec section 2a (Nov 27) adds requirements this branch doesn't have yet:

- `DAILY_SEND_LIMIT` (default 90) in `email/lib/config.mjs`, counted across every send path (confirmations, sequences, campaigns, automatic emails, import). Priority when short: confirmations, then sequences, then campaigns. The branch's new automatic and release emails make this more important, so give them a place in the priority order too (suggest: confirmations > welcome sequence > release > episode/video > digest > regular campaigns; confirm with Ryan).
- If the day's budget is spent at signup, store the subscriber `pending` without sending and let a scheduled job send the confirmation later. Today `subscribe.mjs` always sends immediately.
- `deliverCampaign` (in `email/lib/campaignSender.mjs`) must stop at the budget, leave the campaign `sending`, and continue next run. It currently marks the campaign `sent` after one pass. The `sends` unique constraints already make resuming safe.
- The Netlify Forms import must drip confirmations under the limit, oldest first.
- `stats` should print today's sends against the limit and the active-subscriber count, and flag when a campaign would take more than 3 days (about 270 subscribers): that's the Resend Pro upgrade trigger.
- Give `/api/subscribe` a generous timeout for Neon cold starts.

## 5. Merging into `main`

A trial merge of `origin/main` into `emailer-v1` (Nov 27) conflicts in 6 files:

- `netlify.toml`: keep `main`'s `ignore` line **and** the branch's `[functions]`, `/api/*` redirect and `[functions.confirm] included_files`. Gotcha: `ignore` skips deploys for `emails/` changes, but the `confirm` function bundles `emails/sequences/**` at deploy time to send welcome day 0. After editing welcome emails, either deploy once or make `confirm.mjs` skip sending and leave day 0 to the daily job.
- `src/pages/worship-is-warfare/index.astro` and `[slug].astro`: deleted on `main` (moved to `src/pages/devotionals/` and `src/components/Devotional.astro`). Drop the branch's versions and re-apply its copy change to the new files (below).
- `src/pages/index.astro`, `src/pages/thanks.astro`, `README.md`: take `main` and re-apply the branch's small edits (thanks page `?confirmed=1|0` states; reminder-form copy; README "Email list" section).

Re-apply the reminder-form copy on `main`'s current forms: "before each live stream" / "before each live devotional" / "Get a reminder before each one" appear in `src/pages/index.astro`, `src/pages/devotionals/index.astro`, `src/pages/devotionals/[slug].astro` and `src/components/Devotional.astro`. They should say the email comes once the replay is up.

**Naming question for Ryan:** `main` repositioned WIW as a "Morning Devotional" with `/devotionals/` URLs (old `/worship-is-warfare/` URLs 301). The emails on this branch still say "Worship Is Warfare" and link `/worship-is-warfare`. Ask Ryan which name the emails should use, then update the templates, welcome emails and links. `src/data/episodes.json` keeps the same shape on `main`, so the automatic episode/digest logic still works; `src/data/episode-recaps.json` (summaries by episode number) could enrich the episode email.

Follow `main`'s `CLAUDE.md` deploy budget: do the merge, the gap fixes and the copy updates locally, then push to `main` **once** (one deploy).

## 6. Still waiting on Ryan

- Edits to the email review copies (confirmation, 3 welcome emails, episode, digest, video, 5 release templates). Regenerate HTML review copies with `node scripts/email/preview.mjs <file> --screenshot`.
- Whether to rename the "Remind me" button now that the email comes after the stream.
- Check the day-3 welcome email ("Behold Our God" story); its wording was written by Claude and needs his correction.
- The naming question in section 5.

## 7. Testing notes

- Local Postgres works well: create a DB, run `db/schema.sql`, set `DATABASE_URL` and dummy `EMAIL_API_KEY`/`TOKEN_SECRET`/`WEBHOOK_SECRET`.
- Functions are plain `export default async (req, context)` handlers; import and call them with a `Request` to test without Netlify.
- To test sends without sending, replace `globalThis.fetch` before importing a script: answer `api.resend.com` with `{ "id": "msg_1" }`, and fake YouTube's feed, `/shorts/<id>` (200 = Short), `maxresdefault.jpg` (404 = no HD thumbnail) and watch pages (`"isLiveNow":true` / `"isUpcoming":true`).
- `send-triggered.mjs` honors `EMAIL_NOW` (ISO time, tests only) to simulate Saturdays or release windows.
