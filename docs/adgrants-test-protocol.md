# Ad Grants website test protocol

Google's Ad Grants website policy gives no numbers. This protocol turns each policy
point into a pass/fail check with a bar set above what Google asks. Run it before every
Ad Grants submission and after any large site change.

    npm run build && npm run audit        # 36 automated checks, exit code 1 on any failure

## Automated checks (scripts/adgrants-audit.py)

| Area | Google's policy | Our stricter bar |
|---|---|---|
| A. Content | Substantial, unique content; no thin or placeholder pages; core info in HTML, not PDFs | Every text page has 200+ words of its own text (video pages 100+, legal pages 150+). Key pages have higher floors (home 350, ministry 400, about 350). No two pages share more than 60% of their text. No placeholder wording. Unique title and description on every page. Exactly one H1. |
| B. Mission | Clear mission; programs; address and EIN | Mission and 501(c)(3) status on the home page. EIN, address and email on home, about, ministry and contact. Programs, who we serve and financial transparency on the ministry page. Gift use on the give page. |
| C. Navigation | Clear menu; no broken links | Same header menu on every page, 7 items or fewer. Zero broken internal links or anchors. Every page within 3 clicks of home. No orphan pages. No empty links. Custom 404. Sitemap matches the built pages. |
| D. Speed | Loads quickly on mobile | No third-party iframes on load. Every image has width, height and alt. No image over 300 KB. HTML under 100 KB per page. At most 2 third-party script hosts. |
| E. Security | HTTPS everywhere | No http:// links or resources anywhere. |
| F. Commercial | Limited commercial activity; no ads | No ad networks, no affiliate links, no store or prices. Donation link is HTTPS. |
| G. Action and freshness | Calls to action; up-to-date content | A button-style call to action on every page. Dated content from the last 60 days on the home page. Current year in the footer. |

## Manual checks

1. Lighthouse (mobile) on home, songs, one song page, one episode page, ministry and
   Christmas: performance 90+, accessibility 95+, SEO 100, LCP under 2.5 s, CLS under 0.1.
2. On the live site: http:// redirects to https://, www redirects to the bare domain,
   and the domain does not redirect anywhere else.
3. Click every external button once (Spotify, Apple Music, YouTube, NCF giving).
4. Read the home page as a stranger: in 10 seconds, can you say what the ministry does,
   who it serves, and what to do next?

## Rules that keep the site passing

- A song gets its own page only when it has a chart. Other songs are listed in the
  discography table on /songs. Old URLs redirect there (public/_redirects).
- After adding a chart, run `python3 scripts/extract-chart-info.py`. It reads the PDF
  and writes the key facts (tempo, chords, song order) and, for songs West Coast Revival
  publishes, the lyrics into songs.json. Check the lyrics on the page afterward.
- No "coming soon" buttons or empty sections. If something isn't ready, leave it out.
