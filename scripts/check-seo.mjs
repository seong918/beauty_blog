import { appendFileSync, writeFileSync } from "node:fs";

const siteBase = "https://seong918.github.io/beauty_blog/";
const sitemapUrl = `${siteBase}sitemap.xml`;
const textSitemapUrl = `${siteBase}sitemap.txt`;
const robotsUrl = `${siteBase}robots.txt`;
const llmsUrl = `${siteBase}llms.txt`;
const llmsFullUrl = `${siteBase}llms-full.txt`;
const rssUrl = `${siteBase}rss.xml`;
const referralTrackerUrl = `${siteBase}assets/search-referral-tracker.js`;
const measurementId = "G-WC42SVESY5";
const indexNowKey = "657e42510cc5b092fc829b89f467d66e";
const indexNowKeyUrl = `${siteBase}${indexNowKey}.txt`;
const ratingDatasetUrl = `${siteBase}assets/data/k-beauty-review-rating-distribution-2026.csv`;
const headers = { "user-agent": "KBeautyDataDesk-SEOMonitor/2.0" };
const forbiddenSource = new RegExp(["olive", "young"].join("[\\s_-]*"), "i");
const requiredAiSearchCrawlers = ["OAI-SearchBot", "Claude-SearchBot", "PerplexityBot"];
const requiredGuideUrls = [
  `${siteBase}guides/k-beauty-review-rating-distribution-2026.html`,
  `${siteBase}guides/best-k-beauty-moisturizer-dry-vs-combination-skin.html`,
  `${siteBase}guides/pdrn-vs-hyaluronic-acid-k-beauty-review-data.html`,
  `${siteBase}guides/anua-vs-medicube-pdrn-serum-review-data.html`,
  `${siteBase}guides/k-beauty-products-for-redness-review-data.html`,
];

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchText(url, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { headers, redirect: "follow" });
      const text = await response.text();
      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable || attempt === attempts) return { response, text, attempts: attempt };
    } catch (error) {
      lastError = error;
      if (attempt === attempts) throw error;
    }
    await wait(350 * attempt);
  }
  throw lastError;
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  }));
  return results;
}

function robotsExplicitlyAllows(text, crawler) {
  const lines = text.split(/\r?\n/).map((line) => line.trim());
  const agentIndex = lines.findIndex((line) => line.toLowerCase() === `user-agent: ${crawler}`.toLowerCase());
  if (agentIndex === -1) return false;
  const relativeNextAgent = lines.slice(agentIndex + 1).findIndex((line) => /^user-agent:/i.test(line));
  const groupEnd = relativeNextAgent === -1 ? lines.length : agentIndex + 1 + relativeNextAgent;
  return lines.slice(agentIndex + 1, groupEnd).some((line) => /^allow:\s*\/$/i.test(line));
}

const failures = [];
const sitemap = await fetchText(sitemapUrl);
if (!sitemap.response.ok) failures.push(`${sitemapUrl} returned HTTP ${sitemap.response.status}`);

const urls = [...sitemap.text.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
if (urls.length === 0) failures.push("The sitemap contains no <loc> URLs.");
if (new Set(urls).size !== urls.length) failures.push("The sitemap contains duplicate URLs.");
for (const guideUrl of requiredGuideUrls) {
  if (!urls.includes(guideUrl)) failures.push(`The sitemap is missing the evergreen guide: ${guideUrl}`);
}

const [ratingDataset, textSitemap, robots, keyFile, llms, llmsFull, rss, referralTracker] = await Promise.all([
  fetchText(ratingDatasetUrl),
  fetchText(textSitemapUrl),
  fetchText(robotsUrl),
  fetchText(indexNowKeyUrl),
  fetchText(llmsUrl),
  fetchText(llmsFullUrl),
  fetchText(rssUrl),
  fetchText(referralTrackerUrl),
]);

const ratingDatasetLines = ratingDataset.text.trim().split(/\r?\n/);
if (!ratingDataset.response.ok) {
  failures.push(`${ratingDatasetUrl} returned HTTP ${ratingDataset.response.status}`);
} else if (ratingDatasetLines.length !== 35) {
  failures.push(`The rating-distribution dataset should contain one header and 34 rows; found ${ratingDatasetLines.length} lines.`);
}

const textSitemapUrls = textSitemap.text.split(/\r?\n/).map((url) => url.trim()).filter(Boolean);
const textSitemapMatches = textSitemap.response.ok
  && textSitemapUrls.length === urls.length
  && textSitemapUrls.every((url, index) => url === urls[index]);
if (!textSitemap.response.ok) failures.push(`${textSitemapUrl} returned HTTP ${textSitemap.response.status}`);
else if (!textSitemapMatches) failures.push("The text sitemap does not match sitemap.xml.");

const pageResults = await mapWithConcurrency(urls, 6, async (url) => {
  try {
    const { response, text, attempts } = await fetchText(url);
    return { url, status: response.status, text, attempts };
  } catch (error) {
    return { url, status: 0, text: "", attempts: 3, error: error.message };
  }
});

const titles = new Map();
const descriptions = new Map();
let jsonLdPages = 0;
let ga4Pages = 0;
let referralTrackerPages = 0;
for (const result of pageResults) {
  if (result.status !== 200) {
    failures.push(`${result.url} returned HTTP ${result.status}${result.error ? ` (${result.error})` : ""}`);
    continue;
  }

  const canonical = result.text.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1]
    ?? result.text.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i)?.[1];
  const titleMatches = [...result.text.matchAll(/<title\b[^>]*>([\s\S]*?)<\/title>/gi)];
  const metaTags = [...result.text.matchAll(/<meta\b[^>]*>/gi)].map((match) => match[0]);
  const descriptionTags = metaTags.filter((tag) => /\bname=["']description["']/i.test(tag));
  const description = descriptionTags[0]?.match(/\bcontent=["']([^"']+)["']/i)?.[1] ?? "";
  const h1Count = [...result.text.matchAll(/<h1\b/gi)].length;
  const lang = result.text.match(/<html\b[^>]*\blang=["']([^"']+)["']/i)?.[1] ?? "";
  const jsonLdBlocks = [...result.text.matchAll(/<script\b(?=[^>]*\btype=["']application\/ld\+json["'])[^>]*>([\s\S]*?)<\/script>/gi)];
  const schemaTypes = [];
  let jsonLdValid = jsonLdBlocks.length > 0;
  for (const block of jsonLdBlocks) {
    try {
      const parsed = JSON.parse(block[1]);
      schemaTypes.push(...(parsed["@graph"] ?? [parsed]).map((entry) => entry["@type"]));
    } catch (error) {
      jsonLdValid = false;
      failures.push(`${result.url} contains invalid JSON-LD: ${error.message}`);
    }
  }

  if (canonical !== result.url) failures.push(`${result.url} canonical mismatch: ${canonical || "missing"}`);
  if (/<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*noindex/i.test(result.text)) failures.push(`${result.url} contains a noindex directive.`);
  if (forbiddenSource.test(result.text)) failures.push(`${result.url} exposes source-retailer wording that should stay generic.`);
  if (titleMatches.length !== 1 || !titleMatches[0][1].trim()) failures.push(`${result.url} must contain one non-empty title.`);
  if (descriptionTags.length !== 1 || !description) failures.push(`${result.url} must contain one non-empty meta description.`);
  if (h1Count !== 1) failures.push(`${result.url} must contain exactly one h1; found ${h1Count}.`);
  if (!lang) failures.push(`${result.url} does not declare the HTML language.`);
  if (!jsonLdValid) failures.push(`${result.url} is missing valid JSON-LD structured data.`);
  if (result.url.includes("/posts/") && !schemaTypes.includes("BlogPosting")) failures.push(`${result.url} is missing BlogPosting structured data.`);
  if (result.url.includes("/posts/") && !schemaTypes.includes("BreadcrumbList")) failures.push(`${result.url} is missing BreadcrumbList structured data.`);

  if (jsonLdValid) jsonLdPages += 1;
  if (result.text.includes(measurementId)) ga4Pages += 1;
  else failures.push(`${result.url} is missing the GA4 measurement tag.`);
  if (result.text.includes(referralTrackerUrl) && result.text.includes("data-kbdd-tracker=\"search-referrals-v1\"")) referralTrackerPages += 1;
  else failures.push(`${result.url} is missing the AI/search referral tracker.`);

  const title = titleMatches[0]?.[1].trim();
  if (title) titles.set(title, [...(titles.get(title) ?? []), result.url]);
  if (description) descriptions.set(description, [...(descriptions.get(description) ?? []), result.url]);
}

for (const [title, titleUrls] of titles) {
  if (titleUrls.length > 1) failures.push(`Duplicate page title on ${titleUrls.join(", ")}: ${title}`);
}
for (const [description, descriptionUrls] of descriptions) {
  if (descriptionUrls.length > 1) failures.push(`Duplicate meta description on ${descriptionUrls.join(", ")}: ${description}`);
}

const robotsHasSitemaps = robots.response.ok
  && robots.text.includes(`Sitemap: ${sitemapUrl}`)
  && robots.text.includes(`Sitemap: ${textSitemapUrl}`);
if (!robots.response.ok) failures.push(`${robotsUrl} returned HTTP ${robots.response.status}`);
else if (!robotsHasSitemaps) failures.push("robots.txt does not declare both sitemap URLs.");

const aiCrawlersAllowed = robots.response.ok
  && requiredAiSearchCrawlers.every((crawler) => robotsExplicitlyAllows(robots.text, crawler));
for (const crawler of requiredAiSearchCrawlers) {
  if (!robotsExplicitlyAllows(robots.text, crawler)) failures.push(`robots.txt does not explicitly allow ${crawler}.`);
}

if (!keyFile.response.ok) failures.push(`${indexNowKeyUrl} returned HTTP ${keyFile.response.status}`);
else if (keyFile.text.trim() !== indexNowKey) failures.push("The hosted IndexNow key does not match the configured key.");

const llmsReady = llms.response.ok && llms.text.includes("# The K-Beauty Data Desk") && llms.text.includes("## Posts");
const llmsFullReady = llmsFull.response.ok && llmsFull.text.includes("full fact digest");
const rssReady = rss.response.ok && /<rss\b/i.test(rss.text);
const referralTrackerReady = referralTracker.response.ok
  && referralTracker.text.includes("ai_referral_visit")
  && referralTracker.text.includes("organic_search_visit");
if (!llmsReady) failures.push("llms.txt is unavailable or missing its required index sections.");
if (!llmsFullReady) failures.push("llms-full.txt is unavailable or missing its fact digest.");
if (!rssReady) failures.push("rss.xml is unavailable or invalid.");
if (!referralTrackerReady) failures.push("The public search-referral tracker is unavailable or incomplete.");

const passed = failures.length === 0;
const summary = [
  "# SEO and AI-search health check",
  "",
  `- Checked: ${new Date().toISOString()}`,
  `- Sitemap URLs: ${urls.length}`,
  `- Text sitemap mirror: ${textSitemapMatches ? "OK" : "FAIL"}`,
  `- Pages returning HTTP 200: ${pageResults.filter((result) => result.status === 200).length}/${urls.length}`,
  `- Canonical pages with valid JSON-LD: ${jsonLdPages}/${urls.length}`,
  `- GA4 coverage: ${ga4Pages}/${urls.length}`,
  `- AI/search referral tracker coverage: ${referralTrackerPages}/${urls.length}`,
  `- AI search crawlers explicitly allowed: ${aiCrawlersAllowed ? "OK" : "FAIL"} (${requiredAiSearchCrawlers.join(", ")})`,
  `- LLM discovery files: ${llmsReady && llmsFullReady ? "OK" : "FAIL"}`,
  `- RSS feed: ${rssReady ? "OK" : "FAIL"}`,
  `- robots.txt sitemap declarations: ${robotsHasSitemaps ? "OK" : "FAIL"}`,
  `- IndexNow key file: ${keyFile.response.ok && keyFile.text.trim() === indexNowKey ? "OK" : "FAIL"}`,
  `- Downloadable rating dataset: ${ratingDataset.response.ok && ratingDatasetLines.length === 35 ? "OK" : "FAIL"}`,
  `- Result: ${passed ? "PASS" : "FAIL"}`,
  "",
  ...(failures.length ? ["## Failures", "", ...failures.map((failure) => `- ${failure}`)] : []),
  "",
].join("\n");

console.log(summary);
if (process.env.SEO_REPORT_PATH) writeFileSync(process.env.SEO_REPORT_PATH, summary);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
if (!passed) process.exitCode = 1;
