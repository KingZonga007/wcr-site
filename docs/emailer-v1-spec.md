# WCR Emailer V1: Build Instructions

Instructions for Claude Code. Build a simple, owned email system for West Coast Revival that captures and stores every subscriber, sends emails on a cadence, and follows current deliverability and legal best practices. Keep V1 small. Every part should be easy to extend later.

## 1. Context (read first)

- **Site:** `westcoastrevival.org`, an Astro static site in this repo (`site/`), hosted on Netlify (free plan, credit-based: about 15 credits per deploy, 300 credits per month). Pushing to `main` deploys.
- **Signup forms today:** `src/components/EmailForm.astro` posts to Netlify Forms (form name `signup`) with fields `email`, `source`, `song`, `musician` (`yes` or empty), honeypot `company`, and UTM fields when present. It is used on the home page, footer, song pages (`chart-waitlist:<slug>`), Worship Is Warfare pages (`reminder_signup`) and more. On success it sets `wcr_subscribed` in localStorage (this unlocks chart downloads), fires `wcrTrack(event)` (GA4 `generate_lead`) and dispatches `wcr:subscribed`. Keep all of that behavior.
- **Booking form** (`src/pages/invite.astro`, form `booking`) stays on Netlify Forms. Do not change it.
- **Existing automation:** `.github/workflows/update-content.yml` already runs scheduled jobs with Node. Reuse that pattern.
- **DNS:** Porkbun. The root domain already has MX records for Porkbun email forwarding and an SPF TXT record (`v=spf1 include:_spf.porkbun.com ~all`). Do not break these.
- **Sender identity:** West Coast Revival, 264 S Port Dr, Gilbert, AZ 85233. Reply-to `info@westcoastrevival.org` (forwards to the team inbox).
- **Promise on the site:** "About twice a month. Unsubscribe anytime." Keep the default cadence consistent with that.
- **House style for email copy:** tight and plain. No em dashes.

## 2. Architecture

| Part | Choice | Why |
|---|---|---|
| Sending | An email API provider (recommended: **Resend**; alternatives: Postmark, Amazon SES). Wrap it in one `sendEmail()` module so the provider can be swapped. | Handles deliverability, bounces and webhooks. Check current free-tier limits before choosing. |
| Sending domain | Subdomain `mail.westcoastrevival.org` | Keeps marketing reputation separate from the root domain and avoids conflicts with Porkbun forwarding. |
| Database | Postgres (recommended: **Netlify DB / Neon** free tier). | Real storage, easy export, works from Netlify Functions and GitHub Actions. |
| Capture and links | Netlify Functions under `/api/*` | Same host as the site. |
| Scheduled sending | GitHub Actions cron running a Node script | No function timeouts, free minutes, matches existing automation. |
| Email content | Markdown files in the repo with frontmatter | Ryan can say "write and schedule this email" and Claude edits a file. A commit is the schedule. |

Never commit subscriber data, exports or secrets to the repo. Secrets live in Netlify environment variables and GitHub Actions secrets.

## 3. Data model

```sql
subscribers (
  id uuid primary key,
  email text unique not null,          -- stored lowercased and trimmed
  status text not null,                -- pending | active | unsubscribed | bounced | complained
  first_name text null,
  tags text[] default '{}',            -- e.g. musician, wiw_reminders, chart_waitlist
  source text, song text,              -- from the signup form
  utm_source text, utm_medium text, utm_campaign text,
  consent_text text, consent_ip text, consent_user_agent text,
  created_at timestamptz, confirmed_at timestamptz, unsubscribed_at timestamptz,
  last_sent_at timestamptz
)
campaigns (
  id text primary key,                 -- slug of the markdown file
  subject text, segment text, send_at timestamptz,
  status text,                         -- scheduled | sending | sent | canceled
  sent_count int, created_at timestamptz, sent_at timestamptz
)
sends (
  id uuid primary key,
  campaign_id text null, sequence_step text null,
  subscriber_id uuid references subscribers,
  provider_message_id text,
  status text,                         -- queued | sent | failed | bounced | complained
  sent_at timestamptz,
  unique (campaign_id, subscriber_id),
  unique (sequence_step, subscriber_id)
)
events (                               -- append-only log for audits
  id bigserial primary key, subscriber_id uuid null, type text, data jsonb, created_at timestamptz
)
```

The unique constraints on `sends` are what make sending safe to retry: no one gets the same email twice.

## 4. Capture flow (double opt-in)

1. `POST /api/subscribe` receives the same fields the form sends today.
   - Reject if the honeypot is filled, the email is invalid, or the same IP or email hits more than 5 times in 10 minutes.
   - Upsert the subscriber. New subscribers are `pending`. Merge tags (`musician` when checked, `chart_waitlist` when `source` starts with `chart-waitlist`, `wiw_reminders` when the event is `reminder_signup`).
   - Store consent: the exact sentence shown next to the form, IP, user agent and timestamp.
   - Send a confirmation email with a signed link: `/api/confirm?token=...` (HMAC-signed subscriber id plus expiry, 7 days).
   - Always return `200` with the same body, whether the email is new or existing, so the endpoint can't be used to check who is on the list.
2. `GET /api/confirm` marks the subscriber `active`, sets `confirmed_at`, starts the welcome sequence and redirects to `/thanks?confirmed=1`.
3. Update `EmailForm.astro` to POST to `/api/subscribe` instead of Netlify Forms. Keep the localStorage unlock, `wcrTrack`, and the `wcr:subscribed` event exactly as they are. Change the thanks text to: "Almost done. Check your inbox to confirm." Keep the honeypot.
4. Write a one-time import script: pull existing `signup` submissions from the Netlify Forms API and insert them as `pending`, then send them one confirmation email (they never confirmed before).
5. Re-subscribing an unsubscribed address goes back through confirmation.

## 5. Sending

### One-off campaigns
- Files live in `emails/campaigns/YYYY-MM-DD-slug.md`:

```markdown
---
subject: "New single: More Than Conquerors"
preheader: "Free chord charts in two keys"
segment: all            # all | musician | wiw_reminders | chart_waitlist | test
send_at: 2026-12-01T09:00:00-07:00
---
Body in Markdown. Links get UTM tags added automatically.
```

- Template: one simple, mobile-friendly HTML layout plus an auto-generated plain-text version. Footer on every email: why they're receiving it, the physical address, an unsubscribe link, and a "manage preferences" link if built.
- Job (`scripts/email/send-due.mjs`) runs every 15 minutes from GitHub Actions:
  1. Upsert any campaign files into `campaigns`.
  2. For each campaign with `send_at <= now` and status `scheduled`: set `sending`, select `active` subscribers in the segment, insert `sends` rows, send in batches (respect provider rate limits), record message ids, then set `sent`.
  3. Safe to re-run at any point thanks to the unique constraints.
- `segment: test` sends only to addresses in a `TEST_RECIPIENTS` secret. Every campaign goes to `test` first.
- Add a `--dry-run` flag that prints recipients count and the rendered email without sending.

### Sequences (cadence)
- Files live in `emails/sequences/<name>/<step>.md` with frontmatter `delay_days` (relative to `confirmed_at` or to the previous step).
- V1 sequence: `welcome`
  - Day 0: Welcome from Jonathan and Ryan. What WCR is, the link to all free charts, Worship Is Warfare times.
  - Day 3: The story behind "Behold Our God", with a chart link.
  - Day 7: Worship Is Warfare invitation (Tuesdays and Thursdays, 6am MST) with the YouTube and podcast links.
- A daily job (`scripts/email/send-sequences.mjs`) sends due steps to active subscribers who haven't had them.
- Default cadence after the welcome sequence: about two campaigns a month. Add a guard: do not send a subscriber more than one campaign per 3 days.

## 6. Unsubscribe and feedback handling

- Every marketing email includes `List-Unsubscribe` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click` headers pointing to `POST /api/unsubscribe?token=...`. Gmail and Yahoo require one-click unsubscribe for bulk senders.
- The visible unsubscribe link opens a simple page that confirms with one click. No login, no survey required.
- Process unsubscribes immediately. Never email `unsubscribed`, `bounced` or `complained` addresses again.
- `POST /api/email-webhook` receives provider events (verify the signature). Hard bounce sets `bounced`. Spam complaint sets `complained`. Log everything to `events`.

## 7. Deliverability setup (do these before the first send)

1. Verify `mail.westcoastrevival.org` with the provider and add its DKIM and SPF records in Porkbun DNS.
2. Add a DMARC record for the root domain, starting with monitoring: `_dmarc.westcoastrevival.org TXT "v=DMARC1; p=none; rua=mailto:info@westcoastrevival.org"`. Tighten to `p=quarantine` after a month of clean reports.
3. From name "West Coast Revival", reply-to `info@westcoastrevival.org`.
4. Start small. The first sends go to the confirmed list only, which is small, so volume ramps naturally.
5. Keep spam complaints well under 0.3% (Gmail's limit). Double opt-in plus clear expectations is the main defense.
6. Don't rely on open tracking (Apple Mail inflates it). Measure clicks with UTM tags in GA4 instead: `utm_source=newsletter&utm_medium=email&utm_campaign=<campaign id>`.

## 8. Legal checklist (CAN-SPAM and good practice)

- Accurate from name and subject lines.
- Physical address in every email.
- Working unsubscribe in every email, honored right away.
- Only email people who signed up and confirmed.
- Update `src/pages/privacy.astro` to name the email provider and the database host, and to say subscribers can ask to see or delete their data at `info@westcoastrevival.org`.
- Add a delete script that removes a subscriber and their send history on request.

## 9. Admin (V1 is command line)

Scripts in `scripts/email/`, runnable locally or from a manual GitHub Actions workflow:
- `stats` shows counts by status and tag, new subscribers this week, and last campaign results.
- `export` writes a CSV of active subscribers to a local path (never to the repo).
- `send-test <campaign>` sends one campaign to the test list now.
- `cancel <campaign>` cancels a scheduled campaign.
- `delete <email>` removes a subscriber completely.
- A weekly backup job dumps the database to a private storage location (not the repo).

A web dashboard is a V2 item.

## 10. Secrets and configuration

- Netlify env: `DATABASE_URL`, `EMAIL_API_KEY`, `TOKEN_SECRET`, `WEBHOOK_SECRET`, `SITE_URL=https://westcoastrevival.org`.
- GitHub secrets: `DATABASE_URL`, `EMAIL_API_KEY`, `TOKEN_SECRET`, `TEST_RECIPIENTS`.
- Store `FROM_EMAIL=news@mail.westcoastrevival.org`, `REPLY_TO=info@westcoastrevival.org` and the address in one config module.

## 11. Acceptance tests (V1 is done when all pass)

1. Signing up on any form unlocks charts immediately, fires `generate_lead` in GA4, creates a `pending` subscriber with the right tags, and sends a confirmation email within a minute.
2. Clicking the confirmation link makes the subscriber `active` and the day-0 welcome email arrives.
3. Submitting the same email twice creates one subscriber and returns the same response both times.
4. A campaign file with `segment: test` and a past `send_at` sends only to test recipients on the next run, and re-running the job sends nothing new.
5. One-click unsubscribe from Gmail's built-in button works, and that address is skipped by the next campaign.
6. A simulated hard bounce and spam complaint from the provider webhook mark the subscriber correctly.
7. Every email passes SPF, DKIM and DMARC (check the "show original" headers in Gmail) and shows the physical address and unsubscribe link.
8. Existing Netlify signups are imported as `pending` and each receives exactly one confirmation email.
9. No subscriber data or secrets exist anywhere in the git history.

## 12. V2 ideas (not now)

- Preference center (choose topics: new songs, charts, Worship Is Warfare reminders).
- Automatic emails triggered by the existing content job: new release detected, new episode posted, new chart added.
- Worship Is Warfare reminder emails before each live stream for `wiw_reminders` subscribers.
- Simple admin dashboard behind login.
- Resend-to-non-openers, A/B subject lines.
- Import Ad Grants conversions from confirmed signups.
