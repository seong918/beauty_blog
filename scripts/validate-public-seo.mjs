import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const siteBase = "https://seong918.github.io/beauty_blog/";
const measurementId = "G-WC42SVESY5";
const referralTrackerPath = "assets/search-referral-tracker.js";
const referralTrackerUrl = `${siteBase}${referralTrackerPath}`;
const publicDirectories = ["compare", "guides", "posts"];
const publicRootFiles = [
  "404.html",
  "about.html",
  "index.html",
  "llms-full.txt",
  "llms.txt",
  "rankings.html",
  "rss.xml",
  "skin-type.html",
];
const requiredGuides = [
  "guides/k-beauty-review-rating-distribution-2026.html",
  "guides/best-k-beauty-moisturizer-dry-vs-combination-skin.html",
  "guides/pdrn-vs-hyaluronic-acid-k-beauty-review-data.html",
  "guides/anua-vs-medicube-pdrn-serum-review-data.html",
  "guides/k-beauty-products-for-redness-review-data.html",
];
const forbiddenSource = new RegExp(["olive", "young"].join("[\\s_-]*"), "i");
const requiredSitemapDeclarations = [
  `Sitemap: ${siteBase}sitemap.xml`,
  `Sitemap: ${siteBase}sitemap.txt`,
];
const requiredAiSearchCrawlers = ["OAI-SearchBot", "Claude-SearchBot", "PerplexityBot"];
const ratingReportPath = "guides/k-beauty-review-rating-distribution-2026.html";
const ratingDatasetPath = "assets/data/k-beauty-review-rating-distribution-2026.csv";

function walk(directory) {
  return readdirSync(directory)
    .flatMap((name) => {
      const path = join(directory, name);
      return statSync(path).isDirectory() ? walk(path) : [path];
    })
    .filter((path) => /\.(?:html|txt|xml)$/i.test(path));
}

const files = [
  ...publicRootFiles,
  ...publicDirectories.flatMap((directory) => walk(directory)),
];
const failures = [];

if (!existsSync(referralTrackerPath)) {
  failures.push(`The search-referral tracker is missing: ${referralTrackerPath}`);
}

if (!existsSync(ratingDatasetPath)) {
  failures.push(`The rating-distribution dataset is missing: ${ratingDatasetPath}`);
} else {
  const datasetRows = readFileSync(ratingDatasetPath, "utf8").trim().split(/\r?\n/);
  if (datasetRows.length !== 35) {
    failures.push(`The rating-distribution dataset must contain one header and 34 rows; found ${datasetRows.length} lines.`);
  }
}
const ratingReport = readFileSync(ratingReportPath, "utf8");
if (!ratingReport.includes(`href="../${ratingDatasetPath}"`)) {
  failures.push("The rating-distribution report does not link to its downloadable dataset.");
}

for (const file of files) {
  const content = readFileSync(file, "utf8");
  if (forbiddenSource.test(content)) {
    failures.push(`${file} contains a direct source-retailer reference.`);
  }
}

const sitemapText = readFileSync("sitemap.xml", "utf8");
const sitemapUrls = [...sitemapText.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
const sitemapSet = new Set(sitemapUrls);
if (sitemapSet.size !== sitemapUrls.length) {
  failures.push("sitemap.xml contains duplicate URLs.");
}
const textSitemapUrls = readFileSync("sitemap.txt", "utf8")
  .split(/\r?\n/)
  .map((url) => url.trim())
  .filter(Boolean);
if (
  textSitemapUrls.length !== sitemapUrls.length
  || textSitemapUrls.some((url, index) => url !== sitemapUrls[index])
) {
  failures.push("sitemap.txt does not match the canonical URLs in sitemap.xml.");
}

const robotsLines = readFileSync("robots.txt", "utf8")
  .split(/\r?\n/)
  .map((line) => line.trim());
for (const declaration of requiredSitemapDeclarations) {
  const count = robotsLines.filter((line) => line === declaration).length;
  if (count !== 1) {
    failures.push(`robots.txt must contain exactly one declaration: ${declaration}`);
  }
}
for (const crawler of requiredAiSearchCrawlers) {
  const agentIndex = robotsLines.findIndex((line) => line.toLowerCase() === `user-agent: ${crawler}`.toLowerCase());
  const nextAgentIndex = robotsLines.findIndex((line, index) => index > agentIndex && /^user-agent:/i.test(line));
  const groupEnd = nextAgentIndex === -1 ? robotsLines.length : nextAgentIndex;
  const explicitlyAllowed = agentIndex >= 0
    && robotsLines.slice(agentIndex + 1, groupEnd).some((line) => /^allow:\s*\/$/i.test(line));
  if (!explicitlyAllowed) failures.push(`robots.txt must explicitly allow ${crawler}.`);
}

const expectedCanonicals = new Set();
const pageTitles = new Map();
const pageDescriptions = new Map();
for (const file of files.filter((path) => path.endsWith(".html") && path !== "404.html")) {
  const content = readFileSync(file, "utf8");
  const canonical = content.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1]
    ?? content.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i)?.[1]
    ?? null;
  const relativePath = relative(".", file).replaceAll("\\", "/");
  const expected = relativePath === "index.html" ? siteBase : `${siteBase}${relativePath}`;
  if (canonical !== expected) continue;

  expectedCanonicals.add(canonical);
  const titleMatches = [...content.matchAll(/<title\b[^>]*>([\s\S]*?)<\/title>/gi)];
  const metaTags = [...content.matchAll(/<meta\b[^>]*>/gi)].map((match) => match[0]);
  const descriptionTags = metaTags.filter((tag) => /\bname=["']description["']/i.test(tag));
  const description = descriptionTags[0]?.match(/\bcontent=["']([^"']+)["']/i)?.[1] ?? "";
  const h1Count = [...content.matchAll(/<h1\b/gi)].length;
  const lang = content.match(/<html\b[^>]*\blang=["']([^"']+)["']/i)?.[1] ?? "";
  const trackerCount = [...content.matchAll(/<script\b[^>]*src=["'][^"']*search-referral-tracker\.js[^"']*["'][^>]*>/gi)].length;
  const jsonLdBlocks = [...content.matchAll(/<script\b(?=[^>]*\btype=["']application\/ld\+json["'])[^>]*>([\s\S]*?)<\/script>/gi)];
  const schemaTypes = [];
  for (const block of jsonLdBlocks) {
    try {
      const parsed = JSON.parse(block[1]);
      schemaTypes.push(...(parsed["@graph"] ?? [parsed]).map((entry) => entry["@type"]));
    } catch (error) {
      failures.push(`${file} contains invalid JSON-LD: ${error.message}`);
    }
  }

  if (titleMatches.length !== 1 || !titleMatches[0][1].trim()) failures.push(`${file} must contain one non-empty title.`);
  if (descriptionTags.length !== 1 || !description) failures.push(`${file} must contain one non-empty meta description.`);
  if (h1Count !== 1) failures.push(`${file} must contain exactly one h1; found ${h1Count}.`);
  if (!lang) failures.push(`${file} must declare the HTML language.`);
  if (!content.includes(measurementId)) failures.push(`${file} is missing the GA4 measurement tag.`);
  if (trackerCount !== 1 || !content.includes(referralTrackerUrl)) {
    failures.push(`${file} must load the canonical search-referral tracker exactly once.`);
  }
  if (jsonLdBlocks.length === 0) failures.push(`${file} is missing JSON-LD structured data.`);
  if (relativePath.startsWith("posts/") && !schemaTypes.includes("BlogPosting")) {
    failures.push(`${file} is missing BlogPosting structured data.`);
  }
  if (relativePath.startsWith("posts/") && !schemaTypes.includes("BreadcrumbList")) {
    failures.push(`${file} is missing BreadcrumbList structured data.`);
  }

  const title = titleMatches[0]?.[1].trim();
  if (title) pageTitles.set(title, [...(pageTitles.get(title) ?? []), file]);
  if (description) pageDescriptions.set(description, [...(pageDescriptions.get(description) ?? []), file]);
}

for (const [title, titleFiles] of pageTitles) {
  if (titleFiles.length > 1) failures.push(`Duplicate page title in ${titleFiles.join(", ")}: ${title}`);
}
for (const [description, descriptionFiles] of pageDescriptions) {
  if (descriptionFiles.length > 1) {
    failures.push(`Duplicate meta description in ${descriptionFiles.join(", ")}: ${description}`);
  }
}

for (const canonical of expectedCanonicals) {
  if (!sitemapSet.has(canonical)) {
    failures.push(`Canonical URL is missing from sitemap.xml: ${canonical}`);
  }
}
for (const sitemapUrl of sitemapSet) {
  if (!expectedCanonicals.has(sitemapUrl)) {
    failures.push(`sitemap.xml contains a URL without a matching canonical page: ${sitemapUrl}`);
  }
}

const homepage = readFileSync("index.html", "utf8");
for (const guide of requiredGuides) {
  const guideUrl = `${siteBase}${guide}`;
  if (!homepage.includes(`href="${guide}"`)) failures.push(`Homepage does not link to ${guide}.`);
  if (!sitemapSet.has(guideUrl)) failures.push(`Sitemap does not include ${guideUrl}.`);
}
if (!homepage.includes("cosmetics-loving developer")) {
  failures.push("Homepage does not link to the developer profile.");
}

const about = readFileSync("about.html", "utf8");
if (!about.includes("cosmetics-loving developer")) {
  failures.push("About page does not identify the cosmetics-loving developer/editor.");
}

if (failures.length > 0) {
  console.error("Public SEO validation failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    `Public SEO validation passed: ${files.length} files, ${sitemapUrls.length} unique canonical sitemap URLs, and ${requiredGuides.length} linked guides.`,
  );
}
