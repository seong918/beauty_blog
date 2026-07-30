import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const siteBase = "https://seong918.github.io/beauty_blog/";
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
  "guides/best-k-beauty-moisturizer-dry-vs-combination-skin.html",
  "guides/pdrn-vs-hyaluronic-acid-k-beauty-review-data.html",
  "guides/k-beauty-products-for-redness-review-data.html",
];
const forbiddenSource = new RegExp(["olive", "young"].join("[\\s_-]*"), "i");

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

const expectedCanonicals = new Set();
for (const file of files.filter((path) => path.endsWith(".html") && path !== "404.html")) {
  const content = readFileSync(file, "utf8");
  const canonical = content.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1]
    ?? content.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i)?.[1]
    ?? null;
  const relativePath = relative(".", file).replaceAll("\\", "/");
  const expected = relativePath === "index.html" ? siteBase : `${siteBase}${relativePath}`;
  if (canonical === expected) expectedCanonicals.add(canonical);
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
