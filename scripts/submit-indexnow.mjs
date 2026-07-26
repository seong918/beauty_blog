import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const siteBase = "https://seong918.github.io/beauty_blog/";
const host = "seong918.github.io";
const key = "657e42510cc5b092fc829b89f467d66e";
const keyFile = `${key}.txt`;
const keyLocation = `${siteBase}${keyFile}`;

function sitemapUrls() {
  const xml = readFileSync("sitemap.xml", "utf8");
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
}

function changedFiles() {
  if (process.env.GITHUB_EVENT_NAME === "workflow_dispatch") {
    return ["__all__"];
  }

  const before = process.env.GITHUB_EVENT_BEFORE;
  const isUsableBefore = before && !/^0+$/.test(before);
  const range = isUsableBefore ? [before, "HEAD"] : ["HEAD^", "HEAD"];

  try {
    return execFileSync("git", ["diff", "--name-only", "--diff-filter=ACMDR", ...range], {
      encoding: "utf8",
    })
      .split(/\r?\n/)
      .filter(Boolean);
  } catch {
    return ["__all__"];
  }
}

const canonicalUrls = sitemapUrls();
const canonicalSet = new Set(canonicalUrls);
const files = changedFiles();
const firstInstall = files.includes(keyFile);

let urlList;
if (files.includes("__all__") || firstInstall) {
  urlList = canonicalUrls;
} else {
  urlList = files
    .filter((file) => file.endsWith(".html"))
    .map((file) => (file === "index.html" ? siteBase : `${siteBase}${file}`))
    .filter((url) => canonicalSet.has(url));
}

urlList = [...new Set(urlList)];
if (urlList.length === 0) {
  urlList = [siteBase];
}

if (urlList.length > 10_000) {
  throw new Error(`IndexNow supports at most 10,000 URLs per request; got ${urlList.length}.`);
}

if (process.env.INDEXNOW_DRY_RUN === "1") {
  console.log(`IndexNow dry run: ${urlList.length} URL(s).`);
  for (const url of urlList) {
    console.log(`- ${url}`);
  }
  process.exit(0);
}

const response = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "content-type": "application/json; charset=utf-8" },
  body: JSON.stringify({ host, key, keyLocation, urlList }),
});

if (![200, 202].includes(response.status)) {
  const responseText = await response.text();
  throw new Error(`IndexNow rejected the request: HTTP ${response.status} ${responseText}`.trim());
}

console.log(`IndexNow accepted ${urlList.length} URL(s) with HTTP ${response.status}.`);
for (const url of urlList) {
  console.log(`- ${url}`);
}
