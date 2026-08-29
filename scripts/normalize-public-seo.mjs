import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const siteBase = "https://seong918.github.io/beauty_blog/";
const measurementId = "G-WC42SVESY5";
const referralTrackerUrl = `${siteBase}assets/search-referral-tracker.js`;
const applyChanges = process.argv.includes("--apply");
const publicDirectories = ["compare", "guides", "posts"];
const excludedPublicPaths = new Set([
  "posts/product.html",
  "posts/iope.html",
  "posts/kirin-please-wait-a-moment.html",
]);
const excludedPublicUrls = new Set(
  [...excludedPublicPaths].map((path) => `${siteBase}${path}`),
);
const excludedPublicBasenames = new Set(
  [...excludedPublicPaths].map((path) => path.split("/").at(-1)),
);
const excludedVisibleLabels = [
  "IOPE 잠시만 기다리십시오",
  "잠시만 기다리십시오",
  "Kirin Please Wait a Moment",
];
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
const guideLinks = [
  {
    href: "guides/k-beauty-review-rating-distribution-2026.html",
    label: "Why do K-beauty ratings cluster near five stars? 322,854 records analyzed",
  },
  {
    href: "guides/best-k-beauty-moisturizer-dry-vs-combination-skin.html",
    label: "Best K-beauty moisturizer for dry vs combination skin?",
  },
  {
    href: "guides/pdrn-vs-hyaluronic-acid-k-beauty-review-data.html",
    label: "PDRN vs hyaluronic acid serum: what does the data say?",
  },
  {
    href: "guides/anua-vs-medicube-pdrn-serum-review-data.html",
    label: "Anua vs Medicube PDRN serum: which review signals differ?",
  },
  {
    href: "guides/k-beauty-products-for-redness-review-data.html",
    label: "Which K-beauty products have the strongest soothing-redness poll signals?",
  },
];
const forbiddenSource = new RegExp(["olive", "young"].join("[\\s_-]*"), "i");
const requiredSitemapDeclarations = [
  `Sitemap: ${siteBase}sitemap.xml`,
  `Sitemap: ${siteBase}sitemap.txt`,
];

function walk(directory) {
  return readdirSync(directory)
    .flatMap((name) => {
      const path = join(directory, name);
      return statSync(path).isDirectory() ? walk(path) : [path];
    })
    .filter((path) => /\.(?:html|txt|xml)$/i.test(path));
}

function publicFiles() {
  return [
    ...publicRootFiles,
    ...publicDirectories.flatMap((directory) => walk(directory)),
  ].filter((path) => !excludedPublicPaths.has(relative(".", path).replaceAll("\\", "/")));
}

function removeExcludedItemListEntries(value) {
  if (Array.isArray(value)) return value.map(removeExcludedItemListEntries);
  if (!value || typeof value !== "object") return value;

  const normalized = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === "itemListElement" && Array.isArray(child)) {
      normalized[key] = child
        .filter((item) => !excludedPublicUrls.has(item?.url) && !excludedPublicUrls.has(item?.item))
        .map((item, index) => ({
          ...removeExcludedItemListEntries(item),
          position: index + 1,
        }));
    } else {
      normalized[key] = removeExcludedItemListEntries(child);
    }
  }
  return normalized;
}

function stripExcludedReferences(content, file) {
  content = content.replace(
    /<script\b(?=[^>]*\btype=["']application\/ld\+json["'])[^>]*>([\s\S]*?)<\/script>/gi,
    (block, json) => {
      try {
        return block.replace(json, JSON.stringify(removeExcludedItemListEntries(JSON.parse(json))));
      } catch {
        return block;
      }
    },
  );

  content = content.replace(
    /<div\b[^>]*class=["'][^"']*\bpost\b[^"']*["'][^>]*>[\s\S]*?(?=<div\b[^>]*class=["'][^"']*\bpost\b|<footer\b)/gi,
    (block) => [...excludedPublicPaths].some((path) => block.includes(`href="${path}"`) || block.includes(`href='${path}'`))
      ? ""
      : block,
  );

  content = content.replace(/<li\b[^>]*>[\s\S]*?<\/li>/gi, (item) => {
    const hasExcludedLink = [...excludedPublicBasenames].some(
      (basename) => item.includes(`href="${basename}"`) || item.includes(`href='${basename}'`)
        || item.includes(`href="posts/${basename}"`) || item.includes(`href='posts/${basename}'`)
        || item.includes(`href="../posts/${basename}"`) || item.includes(`href='../posts/${basename}'`),
    );
    return hasExcludedLink ? "" : item;
  });

  content = content.replace(/<item\b[^>]*>[\s\S]*?<\/item>/gi, (item) => (
    [...excludedPublicUrls].some((url) => item.includes(url)) ? "" : item
  ));
  if (file === "llms-full.txt") {
    content = content
      .split(/(?=^## )/m)
      .filter((section) => ![...excludedPublicUrls].some((url) => section.includes(url)))
      .join("");
  }
  content = content
    .split(/\r?\n/)
    .filter((line) => ![...excludedPublicUrls].some((url) => line.includes(url)))
    .filter((line) => !excludedVisibleLabels.some((label) => line.includes(label)))
    .join("\n");

  return content;
}

function stripSourceRetailer(content) {
  let normalized = content;

  normalized = normalized.replace(
    /<li\b[^>]*>(?:(?!<\/li>)[\s\S])*?(?:https?:\/\/[^"'<>]*oliveyoung[^"'<>]*|olive[\s_-]*young)(?:(?!<\/li>)[\s\S])*?<\/li>/gi,
    "",
  );
  normalized = normalized.replace(
    /<a\b[^>]*href=["'][^"']*oliveyoung[^"']*["'][^>]*>[\s\S]*?<\/a>/gi,
    "",
  );
  normalized = normalized.replace(
    /if\(h\.indexOf\(['"]oliveyoung['"]\)>-1\)return['"]oliveyoung['"];/gi,
    "",
  );

  const replacements = [
    [/Olive Young Korea review records/gi, "K-beauty retail review records"],
    [/Olive Young Korea aggregate review data/gi, "aggregate K-beauty retail review data"],
    [/Olive Young aggregate review data/gi, "aggregate K-beauty review data"],
    [/Olive Young Korea aggregates/gi, "K-beauty retail aggregates"],
    [/Olive Young Korea product page/gi, "captured K-beauty retail product page"],
    [/Olive Young Korea aggregate data/gi, "aggregate K-beauty retail data"],
    [/Olive Young Review Signals/gi, "K-Beauty Review Signals"],
    [/Olive Young review signals/gi, "K-beauty review signals"],
    [/Olive Young rankings/gi, "K-beauty retail rankings"],
    [/Olive Young skincare analyses/gi, "K-beauty skincare analyses"],
    [/Olive Young page/gi, "source retail page"],
    [/Olive Young Korea/gi, "a Korean K-beauty retail platform"],
    [/Olive Young/gi, "K-beauty retail"],
    [/olive-youn(?:g)?/gi, "k-beauty"],
  ];

  for (const [pattern, replacement] of replacements) {
    normalized = normalized.replace(pattern, replacement);
  }

  normalized = normalized.replace(
    /The links below search Amazon US and (?:the source retailer's|K-beauty retail's) US storefront\./gi,
    "The shopping links below open current retailer searches.",
  );
  normalized = normalized.replace(
    /the dated a Korean K-beauty retail platform shelf figure/gi,
    "the dated Korean retail shelf figure",
  );
  normalized = normalized.replace(/captured captured K-beauty/gi, "captured K-beauty");
  normalized = normalized.replace(/\.\s+\.<\/em>/g, ".</em>");

  return normalized;
}

function ensureHomepageLinks(content) {
  if (!content.includes("cosmetics-loving developer")) {
    content = content.replace(
      /(<p class="tag">[\s\S]*?<\/p>)/i,
      '$1<p style="font-size:15px;color:#444">Built by a <a href="about.html">cosmetics-loving developer</a> to turn hard-to-compare review signals into more useful buying context.</p>',
    );
  }

  const guideBlock = `<div data-section="evergreen-guides" style="background:#f5f7ef;border:1px solid #dfe5d2;border-radius:10px;padding:14px 16px;margin:1.4em 0"><b>Start with research, not a product name</b><p style="margin:.45em 0 0">${guideLinks
    .map(({ href, label }) => `<a href="${href}">${label}</a>`)
    .join("<br>")}</p></div>`;
  const existingGuideBlock = /<div\b[^>]*data-section=["']evergreen-guides["'][^>]*>[\s\S]*?<\/div>/i;
  content = existingGuideBlock.test(content)
    ? content.replace(existingGuideBlock, guideBlock)
    : content.replace(/<div class="post">/i, `${guideBlock}<div class="post">`);

  return content;
}

function ensureAboutProfile(content) {
  content = content.replace(
    /<p class="tag">[\s\S]*?<\/p>/i,
    '<p class="tag">Built by a cosmetics-loving developer who wants data to make product research more useful—not more confusing.</p>',
  );
  content = content.replace(
    /<h2>Who runs this<\/h2><p>[\s\S]*?<\/p>/i,
    "<h2>Who runs this</h2><p>I am a cosmetics-loving developer and the editor of this site. I use code to line up aggregate review fields consistently, then add editorial judgment about what the numbers can and cannot support. My goal is to create practical context that helps readers ask better questions before buying.</p>",
  );
  content = content.replace(
    /Every post includes a footer link to the product's source retail page so readers can compare the current display with the dated snapshot; the source page can change after capture\./gi,
    "Every post states its capture date and data limits so readers can distinguish a dated snapshot from current retail information.",
  );
  content = content.replace(
    /Every page links back to its source retailer and states the snapshot date so readers can check newer information\./gi,
    "Every page states its snapshot date and data limits so readers know when newer information may be needed.",
  );

  const guideSection = `<section data-section="evergreen-guides"><h2>Start with a research question</h2><p>Begin with the original <a href="guides/k-beauty-review-rating-distribution-2026.html">322,854-record rating-distribution report</a>, then try the <a href="guides/best-k-beauty-moisturizer-dry-vs-combination-skin.html">dry vs combination skin moisturizer guide</a>, the <a href="guides/pdrn-vs-hyaluronic-acid-k-beauty-review-data.html">PDRN vs hyaluronic acid data guide</a>, the <a href="guides/anua-vs-medicube-pdrn-serum-review-data.html">Anua vs Medicube PDRN comparison</a>, or the <a href="guides/k-beauty-products-for-redness-review-data.html">soothing-redness review-poll guide</a>.</p></section>`;
  const existingGuideSection = /<section\b[^>]*data-section=["']evergreen-guides["'][^>]*>[\s\S]*?<\/section>|<h2>Start with a question<\/h2><p>[\s\S]*?<\/p>/i;
  content = existingGuideSection.test(content)
    ? content.replace(existingGuideSection, guideSection)
    : content.replace(/<h2>Affiliate disclosure<\/h2>/i, `${guideSection}<h2>Affiliate disclosure</h2>`);

  return content;
}

function ensureRankingsReportLink(content) {
  const reportBlock = '<p data-section="rating-distribution-report" style="background:#f5f7ef;border:1px solid #dfe5d2;border-radius:10px;padding:12px 14px"><b>New data report:</b> The star averages below sit in a narrow range. See what changes when review-base size is added in the <a href="guides/k-beauty-review-rating-distribution-2026.html">analysis of 322,854 displayed review records</a>, with a downloadable CSV.</p>';
  const existingReportBlock = /<p\b[^>]*data-section=["']rating-distribution-report["'][^>]*>[\s\S]*?<\/p>/i;
  return existingReportBlock.test(content)
    ? content.replace(existingReportBlock, reportBlock)
    : content.replace(/(<p class="tag">[\s\S]*?<\/p>)/i, `$1${reportBlock}`);
}

function ensureLlmsGuideLinks(content) {
  const guideSection = [
    "## Data reports and evergreen guides",
    "",
    ...guideLinks.map(({ href, label }) => `- [${label}](${siteBase}${href})`),
    "",
  ].join("\n");
  const existingGuideSection = /## Data reports and evergreen guides\n[\s\S]*?(?=## Meta)/i;
  if (existingGuideSection.test(content)) {
    return content.replace(existingGuideSection, `${guideSection}\n`);
  }
  return content.replace(/\n## Meta\n/i, `\n${guideSection}\n## Meta\n`);
}

function ensureMeasurement(content) {
  const externalTag = new RegExp(
    `<script\\b[^>]*src=["']https://www\\.googletagmanager\\.com/gtag/js\\?id=${measurementId}["'][^>]*>\\s*</script>`,
    "gi",
  );
  const markedBootstrap = /<script\b[^>]*data-kbdd-ga4=["'][^"']+["'][^>]*>[\s\S]*?<\/script>/gi;
  const legacyBootstrap = new RegExp(
    `<script>window\\.dataLayer=window\\.dataLayer\\|\\|\\[\\];function gtag\\(\\)\\{dataLayer\\.push\\(arguments\\)\\}gtag\\('js',new Date\\(\\)\\);gtag\\('config','${measurementId}'\\)</script>`,
    "gi",
  );
  content = content.replace(externalTag, "").replace(markedBootstrap, "").replace(legacyBootstrap, "");

  const bootstrap = `<script data-kbdd-ga4="${measurementId}">(function(){var p=new URLSearchParams(location.search);if((p.get('utm_source')||'').toLowerCase()==='healthcheck')return;window.dataLayer=window.dataLayer||[];window.gtag=function(){window.dataLayer.push(arguments)};window.gtag('js',new Date());window.gtag('config','${measurementId}');var s=document.createElement('script');s.async=true;s.src='https://www.googletagmanager.com/gtag/js?id=${measurementId}';document.head.appendChild(s)})();</script>`;
  content = content.replace(/<\/head>/i, `${bootstrap}</head>`);

  const trackerTag = `<script defer src="${referralTrackerUrl}" data-kbdd-tracker="search-referrals-v1"></script>`;
  const existingTracker = /<script\b[^>]*src=["'][^"']*search-referral-tracker\.js[^"']*["'][^>]*>\s*<\/script>/gi;
  content = content.replace(existingTracker, "");
  return content.replace(/<\/head>/i, `${trackerTag}</head>`);
}

function normalizeRobots(content) {
  const required = new Set(requiredSitemapDeclarations);
  const lines = content
    .trimEnd()
    .split(/\r?\n/)
    .filter((line) => !required.has(line.trim()));
  const guideIndex = lines.findIndex((line) => line.startsWith("# LLM guide:"));

  if (guideIndex >= 0) {
    lines.splice(guideIndex, 0, ...requiredSitemapDeclarations);
  } else {
    if (lines.at(-1) !== "") lines.push("");
    lines.push(...requiredSitemapDeclarations);
  }

  return `${lines.join("\n")}\n`;
}

function canonicalFromHtml(content) {
  return content.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1]
    ?? content.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i)?.[1]
    ?? null;
}

function expectedUrlForFile(file) {
  const normalized = relative(".", file).replaceAll("\\", "/");
  return normalized === "index.html" ? siteBase : `${siteBase}${normalized}`;
}

function existingLastModified() {
  const sitemap = readFileSync("sitemap.xml", "utf8");
  const values = new Map();
  for (const match of sitemap.matchAll(
    /<url>\s*<loc>([^<]+)<\/loc>(?:\s*<lastmod>([^<]+)<\/lastmod>)?\s*<\/url>/g,
  )) {
    if (match[2]) values.set(match[1], match[2]);
  }
  return values;
}

function rebuildSitemap(files) {
  const previousDates = existingLastModified();
  const entries = new Map();

  for (const file of files.filter((path) => path.endsWith(".html") && path !== "404.html")) {
    const content = readFileSync(file, "utf8");
    const canonical = canonicalFromHtml(content);
    if (!canonical || canonical !== expectedUrlForFile(file)) continue;

    const pageDate = content.match(/"dateModified"\s*:\s*"(\d{4}-\d{2}-\d{2})"/)?.[1]
      ?? content.match(/"datePublished"\s*:\s*"(\d{4}-\d{2}-\d{2})"/)?.[1]
      ?? previousDates.get(canonical)
      ?? null;
    entries.set(canonical, pageDate);
  }

  const rootOrder = [
    siteBase,
    `${siteBase}rankings.html`,
    `${siteBase}skin-type.html`,
    `${siteBase}about.html`,
  ];
  const urls = [...entries.keys()].sort((a, b) => {
    const aRoot = rootOrder.indexOf(a);
    const bRoot = rootOrder.indexOf(b);
    if (aRoot !== -1 || bRoot !== -1) {
      return (aRoot === -1 ? Number.MAX_SAFE_INTEGER : aRoot)
        - (bRoot === -1 ? Number.MAX_SAFE_INTEGER : bRoot);
    }
    return a.localeCompare(b);
  });

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map((url) => {
      const lastModified = entries.get(url);
      return lastModified
        ? `  <url><loc>${url}</loc><lastmod>${lastModified}</lastmod></url>`
        : `  <url><loc>${url}</loc></url>`;
    }),
    "</urlset>",
    "",
  ].join("\n");
  const text = `${urls.join("\n")}\n`;

  return { xml, text, count: urls.length };
}

const files = publicFiles();
const changed = [];

for (const file of files) {
  const original = readFileSync(file, "utf8");
  let normalized = stripExcludedReferences(original, file);
  normalized = stripSourceRetailer(normalized);
  if (file === "index.html") normalized = ensureHomepageLinks(normalized);
  if (file === "about.html") normalized = ensureAboutProfile(normalized);
  if (file === "rankings.html") normalized = ensureRankingsReportLink(normalized);
  if (file === "llms.txt") normalized = ensureLlmsGuideLinks(normalized);
  if (file.endsWith(".html")) normalized = ensureMeasurement(normalized);

  if (forbiddenSource.test(normalized)) {
    throw new Error(`Source-retailer reference remains after normalization: ${file}`);
  }
  if (normalized !== original) {
    changed.push(file);
    if (applyChanges) writeFileSync(file, normalized);
  }
}

const sitemap = rebuildSitemap(files);
const oldSitemap = readFileSync("sitemap.xml", "utf8");
if (oldSitemap !== sitemap.xml) {
  changed.push("sitemap.xml");
  if (applyChanges) writeFileSync("sitemap.xml", sitemap.xml);
}
const oldTextSitemap = existsSync("sitemap.txt") ? readFileSync("sitemap.txt", "utf8") : "";
if (oldTextSitemap !== sitemap.text) {
  changed.push("sitemap.txt");
  if (applyChanges) writeFileSync("sitemap.txt", sitemap.text);
}
const oldRobots = readFileSync("robots.txt", "utf8");
const normalizedRobots = normalizeRobots(oldRobots);
if (oldRobots !== normalizedRobots) {
  changed.push("robots.txt");
  if (applyChanges) writeFileSync("robots.txt", normalizedRobots);
}

if (changed.length > 0 && !applyChanges) {
  console.error(`Public SEO normalization required for ${changed.length} file(s):`);
  for (const file of changed) console.error(`- ${file}`);
  process.exitCode = 1;
} else {
  console.log(
    `${applyChanges ? "Normalized" : "Validated"} ${files.length} public file(s); sitemap contains ${sitemap.count} canonical URL(s).`,
  );
  if (changed.length > 0) {
    for (const file of changed) console.log(`- ${file}`);
  }
}
