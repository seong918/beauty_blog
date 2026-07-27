import { appendFileSync, writeFileSync } from "node:fs";

const siteBase = "https://seong918.github.io/beauty_blog/";
const sitemapUrl = `${siteBase}sitemap.xml`;
const robotsUrl = `${siteBase}robots.txt`;
const indexNowKey = "657e42510cc5b092fc829b89f467d66e";
const indexNowKeyUrl = `${siteBase}${indexNowKey}.txt`;
const headers = { "user-agent": "KBeautyDataDesk-SEOMonitor/1.0" };
const forbiddenSource = new RegExp(["olive", "young"].join("[\\s_-]*"), "i");
const requiredGuideUrls = [
  `${siteBase}guides/best-k-beauty-moisturizer-dry-vs-combination-skin.html`,
  `${siteBase}guides/pdrn-vs-hyaluronic-acid-k-beauty-review-data.html`,
  `${siteBase}guides/k-beauty-products-for-redness-review-data.html`,
];

async function fetchText(url) {
  const response = await fetch(url, { headers, redirect: "follow" });
  return { response, text: await response.text() };
}

const failures = [];
const sitemap = await fetchText(sitemapUrl);
if (!sitemap.response.ok) {
  failures.push(`${sitemapUrl} returned HTTP ${sitemap.response.status}`);
}

const urls = [...sitemap.text.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
if (urls.length === 0) {
  failures.push("The sitemap contains no <loc> URLs.");
}
for (const guideUrl of requiredGuideUrls) {
  if (!urls.includes(guideUrl)) {
    failures.push(`The sitemap is missing the evergreen guide: ${guideUrl}`);
  }
}

const pageResults = await Promise.all(
  urls.map(async (url) => {
    try {
      const { response, text } = await fetchText(url);
      return { url, status: response.status, text };
    } catch (error) {
      return { url, status: 0, text: "", error: error.message };
    }
  }),
);

for (const result of pageResults) {
  if (result.status !== 200) {
    failures.push(`${result.url} returned HTTP ${result.status}${result.error ? ` (${result.error})` : ""}`);
    continue;
  }

  const canonical = result.text.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1]
    ?? result.text.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i)?.[1];
  if (canonical !== result.url) {
    failures.push(`${result.url} canonical mismatch: ${canonical || "missing"}`);
  }
  if (/<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*noindex/i.test(result.text)) {
    failures.push(`${result.url} contains a noindex directive.`);
  }
  if (forbiddenSource.test(result.text)) {
    failures.push(`${result.url} exposes source-retailer wording that should stay generic.`);
  }
}

const robots = await fetchText(robotsUrl);
if (!robots.response.ok) {
  failures.push(`${robotsUrl} returned HTTP ${robots.response.status}`);
} else if (!robots.text.includes(`Sitemap: ${sitemapUrl}`)) {
  failures.push("robots.txt does not declare the canonical sitemap URL.");
}

const keyFile = await fetchText(indexNowKeyUrl);
if (!keyFile.response.ok) {
  failures.push(`${indexNowKeyUrl} returned HTTP ${keyFile.response.status}`);
} else if (keyFile.text.trim() !== indexNowKey) {
  failures.push("The hosted IndexNow key does not match the configured key.");
}

const passed = failures.length === 0;
const summary = [
  "# SEO health check",
  "",
  `- Checked: ${new Date().toISOString()}`,
  `- Sitemap URLs: ${urls.length}`,
  `- Pages returning HTTP 200: ${pageResults.filter((result) => result.status === 200).length}/${urls.length}`,
  `- robots.txt sitemap declaration: ${robots.response.ok && robots.text.includes(`Sitemap: ${sitemapUrl}`) ? "OK" : "FAIL"}`,
  `- IndexNow key file: ${keyFile.response.ok && keyFile.text.trim() === indexNowKey ? "OK" : "FAIL"}`,
  `- Result: ${passed ? "PASS" : "FAIL"}`,
  "",
  ...(failures.length ? ["## Failures", "", ...failures.map((failure) => `- ${failure}`)] : []),
  "",
].join("\n");

console.log(summary);
if (process.env.SEO_REPORT_PATH) {
  writeFileSync(process.env.SEO_REPORT_PATH, summary);
}
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
}
if (!passed) {
  process.exitCode = 1;
}
