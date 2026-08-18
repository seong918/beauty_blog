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

const candidates = changedFiles();
if (candidates.length === 0) {
  console.log("No newly added post files to validate.");
} else {
  for (const candidate of candidates) validateCandidate(candidate, { allowTracked: true });
  console.log(`Validated ${candidates.length} newly added post file(s).`);
}
