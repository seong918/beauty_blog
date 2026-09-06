import { execFileSync } from "node:child_process";
import { validateCandidate } from "./validate-publish-candidate.mjs";

function changedFiles() {
  try {
    return execFileSync(
      "git",
      ["diff", "--name-only", "--diff-filter=A", "HEAD^", "HEAD", "--", "posts/*.html"],
      { encoding: "utf8" },
    )
      .split(/\r?\n/)
      .map((path) => path.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

// A post that existed in an earlier commit and is being re-added is a restoration (for example after a
// bad merge deleted it), not a new daily publication, so its original dates stay valid.
function isRestoration(path) {
  try {
    return execFileSync(
      "git",
      ["log", "--diff-filter=A", "--format=%h", "HEAD^", "--", path],
      { encoding: "utf8" },
    ).trim().length > 0;
  } catch {
    return false;
  }
}

const candidates = changedFiles();
if (candidates.length === 0) {
  console.log("No newly added post files to validate.");
} else {
  for (const candidate of candidates) {
    const restored = isRestoration(candidate);
    validateCandidate(candidate, { allowTracked: true, requireToday: !restored });
    if (restored) console.log(`Restored post accepted with its original dates: ${candidate}`);
  }
  console.log(`Validated ${candidates.length} newly added post file(s).`);
}
