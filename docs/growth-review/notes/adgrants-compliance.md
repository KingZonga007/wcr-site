# adgrants-compliance notes

Newest entries at the bottom. Each entry: date, best-practice changes found (with links), what was checked, what to recheck next run.

## 2026-11-26 (first run)

Rule changes found: none to the core Ad Grants rules. Checked:
- https://support.google.com/grants/answer/117827 (account management): 5% monthly account CTR, 2 consecutive months below = temporary deactivation; conversion tracking with at least 1 conversion/month; at least 2 sitelinks; proper location settings; conversion-based bidding; respond to program surveys. No 90-day login rule listed.
- https://support.google.com/grants/answer/7651240 (CTR): unchanged. Reactivation looks at "Total: filtered keywords" row >= 5% for last week. Accounts younger than 90 days are not reviewed for CTR.
- https://support.google.com/nonprofits/answer/9314402 (compliance guide): single-word ban (brand, approved medical conditions, some other cases excepted), no overly generic keywords, pause QS 1-2 ("—" exempt), 2+ ad groups per campaign, 2+ sitelinks, annual survey. Note: Google's sample automated rule shows "> 3"; our rule should be Quality Score <= 2.
- https://support.google.com/grants/answer/9042207: fetch blocked (permission not answered). 9165968 returned the Help Center homepage (page moved). Recheck next run.
- Practitioner news: Search Engine Land (about Oct 2026) reports AI Max appearing enabled in some Ad Grants Search campaigns without the advertiser turning it on. Not confirmed by Google. CTR risk. https://searchengineland.com/google-ads-ai-max-spotted-automatically-enabled-in-some-ad-grants-accounts-497261
- Google Ads policy: Limited Ad Serving expanded to all Google Ads from Aug 2026 (gradual to 2028); new or "unqualified" advertisers may have impressions limited; advertiser verification and pinning the domain in headlines help. https://support.google.com/adspolicy/answer/17344822

Scored from snapshot 2026-11-26 (window Nov 19 to 25):
- CTR: 5.43% last 7 days (792 impr, 43 clicks). MTD not collected. Without the 4 keywords paused Nov 26 (447 impr, 11 clicks), the same window is 9.28% (345 impr, 32 clicks). Pass (provisional).
- QS 1-2: not collected. Unknown. Automated rule existence unknown.
- Single-word: none seen in the keywords with clicks ("west coast revival" is brand, 3 words). 279 keywords, not all listed. Probable pass.
- Generic: the generic Christmas terms were paused Nov 26. "free chord charts" (45 impr, 2.22%) is borderline generic; already an open hypothesis to Dec 3.
- Conversions: 1 conversion in window; GA4 import from Nov 25. Pass for November if import stays Recording (not verified).
- Structure: each campaign has 2+ enabled ad groups. Ads per ad group and sitelink count not collected. Callouts missing from 3 campaigns.
- Mission/website: Podcast RSA "Eligible (Limited), Copyrighted content", headline "Worship Is Warfare Podcast". 4 Podcast keywords Low search volume. Morning Devotional 0 impressions.
- Recommendations to ignore: AI Max, broad match keywords, dynamic images (low value). Portfolio bid strategy: ignore for now.

Recheck next run:
- Month-to-date CTR for November final and December MTD; account creation date (90-day CTR review exemption?).
- Quality Score column; QS <= 2 automated rule present and running daily.
- AI Max status per campaign (Campaign settings), ads per ad group, sitelink count, geo settings, conversion action status (Recording) and which are primary.
- Podcast ad limited status after any rewrite; Policy Manager notifications; Limited Ad Serving notice; advertiser verification status.
- Hero campaign CTR in its first full week.
