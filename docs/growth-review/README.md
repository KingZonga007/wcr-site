# Weekly growth review

Three expert agents review the website and the Google Ad Grants account every week.
They only suggest. Ryan picks what to implement; nothing changes without his approval.

| Agent | Profile | Looks at |
|---|---|---|
| Site visibility | .claude/agents/site-visibility.md | Search visibility, speed, structured data, Ad Grants landing-page quality |
| Ad Grants compliance | .claude/agents/adgrants-compliance.md | Program rules, account health, technical fixes |
| Ads strategist | .claude/agents/ads-strategist.md | Long-term plan, progress over time, new campaigns, leave alone vs pivot |

## Files

- `snapshots/YYYY-MM-DD.md`: the data the coordinator collected for that run.
- `reports/YYYY-MM-DD.md`: the suggestions sent to Ryan, and his decisions.
- `metrics.csv`: one row per week. The strategist's source for trends.
- `log.md`: every suggestion's outcome (approved, declined, deferred, done), open
  hypotheses with review dates, and standing decisions.
- `notes/<agent>.md`: each agent's running notes: best-practice changes found, what it
  checked, what to recheck.

## How a run works (coordinator)

The coordinator is the session the scheduled task starts.

1. Setup: attach and clone KingZonga007/wcr-site, `npm ci`. Load the built-in-browser skill.
2. Collect the snapshot in the built-in browser (read-only in Google Ads and GA4: never click
   Apply, Pause, Enable, Save, Remove or Dismiss). Save it as `snapshots/<date>.md`:
   - Google Ads, account 138-524-5456, last 7 days and month to date: per campaign spend,
     impressions, clicks, CTR, conversions, status (Learning, Limited); per ad group the same;
     keywords with impressions, CTR and Quality Score; the top search terms; ads that are
     disapproved or limited; Recommendations headlines. Clear leftover table filters first
     ("No keywords match your filters" means a filter is hiding rows). Rows load lazily:
     scroll the table to read them all.
   - GA4 property 563525086, last 7 days vs the previous 7: sessions by source/medium,
     key events by event name and by landing page, top landing pages from google / cpc.
   - Search Console, if the browser is signed in: last 28 days queries and pages.
3. Run the three agents in parallel with the Agent tool (subagent_type = the agent name),
   passing each the snapshot path and the date. Then send the strategist the other two
   agents' suggestions and ask for a short conflict check (anything that would reset a
   learning period or work against the plan).
4. Merge into one report (format below). Remove duplicates. Number every suggestion so Ryan
   can answer by number. Put compliance items marked "Now" first.
5. Append a row to `metrics.csv`, update `log.md` (new suggestions as "proposed", hypothesis
   verdicts), save `reports/<date>.md`, commit and push to main. Only files under
   docs/growth-review/ and the notes files change, so the push does not change the site.
6. Send the report to Ryan with SendUserMessage, and a push notification if available.
7. If Ryan replies in the session with approvals, implement exactly those items, verify each
   one (build and audit for site changes; re-read the setting in Google Ads for account
   changes), record them as "done" in `log.md`, push, and confirm in one short message.
   Declined items go in the log as "declined" with his reason if he gave one.

## Report format

```
Weekly growth review, <date>

Snapshot: $X spent last 7 days (Y% of the $329/day grant), Z clicks, CTR A% (month to date B%),
N conversions. One line on the trend.
Compliance: <Compliant / At risk>. One line.

Suggested changes (reply with the numbers you want done):
1. [Compliance, Now] ...  Why: ...  Effect: ...
2. [Strategy] ...
3. [Site] ...

Leave alone this week: <items and the date each gets judged>
Next 30 to 90 days: <two lines from the strategist>
```

Rules for the report: tight, accurate copy, no em dashes, no flourishes. Each item says what,
why and the expected effect in one or two lines. No more than about 8 items; the agents rank
and cut. If nothing needs changing, say so.

## Account map (update when campaigns change)

Ad Grants account 138-524-5456, Maximize conversions, $329/day grant cap.

| Campaign | ID | Budget | Purpose |
|---|---|---|---|
| Christmas Charts | 24472335785 | $80/day | Christmas chord charts and carols, We Three Kings. Seasonal: plan wind-down after Dec 25. |
| Chord Charts | 24467132127 | $150/day | Free chord charts: hymns, WCR songs. Behold Our God and All Creatures ad groups paused here (moved to the hero campaign). |
| Behold Our God & All Creatures | 24550023755 | $150/day | Hero campaign for the two lead songs. Enabled Nov 25, 2026. Only those two ad groups enabled. |
| Morning Devotional | 24478527781 | $80/day | Morning Devotional (/devotionals/), podcast and morning worship searches. Renamed from Worship Is Warfare Nov 25, 2026. |

The paid account 598-133-4788 (H/J/K Demand Gen, We Three Kings video) is out of scope.
