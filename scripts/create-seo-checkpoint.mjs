const token = process.env.GITHUB_TOKEN;
const repository = process.env.GITHUB_REPOSITORY;
const dryRun = process.env.DRY_RUN === "1";
const now = new Date(process.env.SEO_CHECKPOINT_NOW || Date.now());

if (!repository) {
  throw new Error("GITHUB_REPOSITORY is required.");
}
if (!dryRun && !token) {
  throw new Error("GITHUB_TOKEN is required outside dry-run mode.");
}

const checkpoints = [
  {
    date: "2026-08-09T00:00:00Z",
    title: "[SEO checkpoint] 2-week Search Console review",
    period: "2-week",
  },
  {
    date: "2026-08-23T00:00:00Z",
    title: "[SEO checkpoint] 4-week Search Console review",
    period: "4-week",
  },
];

const [owner, repo] = repository.split("/");
const apiBase = `https://api.github.com/repos/${owner}/${repo}`;
const headers = {
  accept: "application/vnd.github+json",
  authorization: `Bearer ${token || "dry-run"}`,
  "x-github-api-version": "2022-11-28",
  "content-type": "application/json",
};

let existingTitles = new Set();
if (!dryRun) {
  const response = await fetch(`${apiBase}/issues?state=all&per_page=100`, { headers });
  if (!response.ok) {
    throw new Error(`Could not list issues: HTTP ${response.status}`);
  }
  const issues = await response.json();
  existingTitles = new Set(issues.map((issue) => issue.title));
}

for (const checkpoint of checkpoints) {
  if (now < new Date(checkpoint.date) || existingTitles.has(checkpoint.title)) {
    continue;
  }

  const body = [
    `This is the scheduled ${checkpoint.period} SEO checkpoint for The K-Beauty Data Desk.`,
    "",
    "Record the current values before changing titles or publishing more templated pages:",
    "",
    "- [ ] Google sitemap status and discovered-page count",
    "- [ ] Google indexed-page count",
    "- [ ] Search impressions, clicks, CTR, and average position",
    "- [ ] Top queries and pages, including the three question-led guides",
    "- [ ] Bing sitemap discovered-page count",
    "- [ ] Bing IndexNow submitted, crawled, and indexed URL counts",
    "- [ ] Referring domains or meaningful referral traffic",
    "- [ ] Decisions for the next two weeks",
    "",
    "Baseline (2026-07-26): Google reported 1 indexed page in a delayed report; the homepage and three guides were submitted to the priority crawl queue. Bing successfully discovered 36 sitemap URLs.",
  ].join("\n");

  if (dryRun) {
    console.log(`[dry-run] Would create: ${checkpoint.title}`);
    continue;
  }

  const response = await fetch(`${apiBase}/issues`, {
    method: "POST",
    headers,
    body: JSON.stringify({ title: checkpoint.title, body }),
  });
  if (!response.ok) {
    throw new Error(`Could not create "${checkpoint.title}": HTTP ${response.status}`);
  }
  console.log(`Created ${checkpoint.title}`);
}
