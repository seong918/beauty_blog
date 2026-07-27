import { cpSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

const outputDirectory = ".pages-artifact";
const publicDirectories = ["assets", "compare", "guides", "posts"];
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

console.log(
  `Prepared Pages artifact with ${rootEntries.length} root files and ${publicDirectories.length} public directories.`,
);
