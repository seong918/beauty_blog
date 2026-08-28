# SEO tracking baseline

Baseline date: 2026-07-26

## Google Search Console

- The homepage is indexed and was re-submitted to the priority crawl queue.
- The three question-led guides were reported as unknown URLs and were each submitted to the priority crawl queue.
- The sitemap was removed and re-submitted on 2026-07-26. Google accepted the submission but immediately continued to show `Couldn't fetch`, zero discovered pages.
- The page indexing report showed one indexed page, but its latest data was dated 2026-07-10 and therefore lagged behind the current site.

## Bing Webmaster Tools

- The site is verified.
- `sitemap.xml` status: Success.
- URLs discovered: 36.
- IndexNow is integrated into the GitHub Pages deployment workflow.

## Checkpoints

- 2-week review: 2026-08-09
- 4-week review: 2026-08-23

The scheduled SEO workflow checks public crawlability every Sunday at 09:00 Asia/Seoul and creates a GitHub issue when each Search Console checkpoint becomes due.

## 2026-08-29 SEO and AI-search audit

- The public XML and text sitemaps contain 67 canonical URLs, and the weekly technical monitor has been running successfully.
- The public `robots.txt` explicitly allows OAI-SearchBot, Claude-SearchBot, and PerplexityBot. The short and full LLM discovery files are also published.
- Some recently generated posts did not include the GA4 bootstrap, so their visits could not be measured. The deployment normalizer now installs GA4 consistently on every canonical HTML page.
- GA4 previously received normal page views and affiliate-click events, but there was no dedicated AI-referral classification. A versioned site-wide tracker now emits:
  - `ai_referral_visit` with `ai_source`, `detection_method`, `referrer_host`, and `landing_path`.
  - `organic_search_visit` with `search_engine`, `referrer_host`, and `landing_path`.
- The tracker recognizes referrals or explicit `utm_source` values for ChatGPT, Perplexity, Claude, Gemini, Copilot, You.com, Phind, Poe, and Meta AI. It does not collect search queries or full referring URLs.
- AI assistants often remove referrer data. Visits with neither a referrer nor an identifying UTM parameter cannot be attributed to an AI source; GA4 referral tracking therefore measures attributable clicks, not unclicked citations or every AI-originated visit.
- The weekly checker now verifies every canonical page's HTTP status, canonical URL, title, description, H1, language, JSON-LD, GA4 tag, and AI/search tracker. Requests are concurrency-limited and retry transient 429/5xx responses to avoid false alarms from burst traffic.

### GA4 reporting

In GA4, create an exploration filtered to event name `ai_referral_visit`, then break it down by `ai_source` and `landing_path`. Use `organic_search_visit` with `search_engine` for a matching SEO landing-page view. Register the event parameters as custom dimensions if they are not already available in explorations.
