import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const siteBase = "https://seong918.github.io/beauty_blog/";
const placeholderPattern = new RegExp([
  "please\\s+wait",
  "just\\s+a\\s+moment",
  "checking\\s+your\\s+browser",
  "access\\s+denied",
  "request\\s+blocked",
  "security\\s+check",
  "service\\s+unavailable",
  "captcha",
  "잠시만\\s*기다",
  "접근이?\\s*거부",
  "로봇\\s*(?:확인|검사)",
].join("|"), "i");
const genericFilenamePattern = /^(?:product|post|article|review|new-post)\.html$/i;
const requiredSchemaTypes = ["BlogPosting", "FAQPage", "BreadcrumbList"];

function fail(message) {
  throw new Error(message);
}

function htmlText(content) {
  return content
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(?:[a-z]+|#\d+|#x[\da-f]+);/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function koreaDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function isTracked(path) {
  try {
    execFileSync("git", ["ls-files", "--error-unmatch", path], {
      cwd: repositoryRoot,
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

function postFiles() {
  const postsDirectory = join(repositoryRoot, "posts");
  return readdirSync(postsDirectory)
    .filter((name) => name.endsWith(".html"))
    .map((name) => join(postsDirectory, name));
}

function validateCandidate(inputPath, { allowTracked = false } = {}) {
  const absolutePath = resolve(repositoryRoot, inputPath);
  const relativePath = relative(repositoryRoot, absolutePath).replaceAll("\\", "/");

  if (!relativePath.startsWith("posts/") || relativePath.includes("..")) {
    fail(`Candidate must be an HTML file inside posts/: ${inputPath}`);
  }
  if (!existsSync(absolutePath)) fail(`Candidate does not exist: ${relativePath}`);
  if (genericFilenamePattern.test(basename(absolutePath))) {
    fail(`Candidate uses a generic filename: ${relativePath}`);
  }
  if (!allowTracked && isTracked(relativePath)) {
    fail(`Candidate already exists in git; daily publishing must add a new product: ${relativePath}`);
  }

  const content = readFileSync(absolutePath, "utf8");
  const title = content.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim();
  const h1 = content.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g, " ").trim();
  if (!title || !h1) fail("Candidate must contain a non-empty title and H1.");
  if (placeholderPattern.test(`${title} ${h1}`)) {
    fail(`Candidate looks like a loading, CAPTCHA, or access-block page: ${title}`);
  }

  const expectedCanonical = `${siteBase}${relativePath}`;
  const canonical = content.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1]
    ?? content.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i)?.[1];
  if (canonical !== expectedCanonical) {
    fail(`Candidate canonical must be ${expectedCanonical}; found ${canonical ?? "none"}.`);
  }

  for (const schemaType of requiredSchemaTypes) {
    if (!content.includes(`"@type":"${schemaType}"`) && !content.includes(`"@type": "${schemaType}"`)) {
      fail(`Candidate is missing ${schemaType} structured data.`);
    }
  }

  const today = koreaDate();
  const published = content.match(/"datePublished"\s*:\s*"(\d{4}-\d{2}-\d{2})"/)?.[1];
  const modified = content.match(/"dateModified"\s*:\s*"(\d{4}-\d{2}-\d{2})"/)?.[1];
  if (published !== today || modified !== today) {
    fail(`Candidate publish/modified dates must both be ${today}; found ${published ?? "none"}/${modified ?? "none"}.`);
  }

  const sourceProductIds = [...content.matchAll(/[?&]goodsNo=([A-Z0-9]+)/gi)].map((match) => match[1]);
  const uniqueProductIds = [...new Set(sourceProductIds)];
  if (uniqueProductIds.length !== 1) {
    fail(`Candidate must contain exactly one source goodsNo; found ${uniqueProductIds.length}.`);
  }
  const [productId] = uniqueProductIds;
  for (const otherPath of postFiles()) {
    if (otherPath === absolutePath) continue;
    const otherContent = readFileSync(otherPath, "utf8");
    if (new RegExp(`[?&]goodsNo=${productId}(?:&|["'])`, "i").test(otherContent)) {
      fail(`Source product ${productId} is already covered by ${relative(repositoryRoot, otherPath)}.`);
    }
  }

  const visibleText = htmlText(content);
  const wordCount = visibleText.split(/\s+/).filter(Boolean).length;
  if (wordCount < 900) fail(`Candidate is too short: ${wordCount} visible words; minimum is 900.`);

  const localImages = [...content.matchAll(/<img[^>]+src=["']\.\.\/([^"']+)["']/gi)]
    .map((match) => match[1]);
  if (localImages.length === 0) fail("Candidate must include at least one local image.");
  for (const imagePath of localImages) {
    if (!existsSync(join(repositoryRoot, imagePath))) fail(`Candidate image is missing: ${imagePath}`);
  }

  return { relativePath, title, productId, wordCount, imageCount: localImages.length };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const allowTracked = args.includes("--allow-tracked");
  const candidatePath = args.find((arg) => !arg.startsWith("--"));
  if (!candidatePath) {
    console.error("Usage: node scripts/validate-publish-candidate.mjs [--allow-tracked] posts/<slug>.html");
    process.exit(2);
  }

  try {
    const result = validateCandidate(candidatePath, { allowTracked });
    console.log(`Publish candidate passed: ${result.relativePath}`);
    console.log(`- title: ${result.title}`);
    console.log(`- source product: ${result.productId}`);
    console.log(`- visible words: ${result.wordCount}`);
    console.log(`- local images: ${result.imageCount}`);
  } catch (error) {
    console.error(`Publish candidate failed: ${error.message}`);
    process.exitCode = 1;
  }
}

export { validateCandidate };
