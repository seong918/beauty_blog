import { cpSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

const outputDirectory = ".pages-artifact";
const publicDirectories = ["assets", "compare", "guides", "posts"];
const excludedPublicPaths = [
  "posts/product.html",
  "posts/iope.html",
  "posts/kirin-please-wait-a-moment.html",
];
const rootEntries = readdirSync(".").filter((name) => {
  if (name === ".nojekyll" || name === "robots.txt") return true;
  if (!/\.(?:html|txt|xml)$/i.test(name)) return false;
  return statSync(name).isFile();
});

rmSync(outputDirectory, { recursive: true, force: true });
mkdirSync(outputDirectory, { recursive: true });

for (const entry of rootEntries) {
  cpSync(entry, join(outputDirectory, entry));
}
for (const directory of publicDirectories) {
  cpSync(directory, join(outputDirectory, directory), { recursive: true });
}
for (const path of excludedPublicPaths) {
  rmSync(join(outputDirectory, path), { force: true });
}

console.log(
  `Prepared Pages artifact with ${rootEntries.length} root files and ${publicDirectories.length} public directories; excluded ${excludedPublicPaths.length} placeholder pages.`,
);
