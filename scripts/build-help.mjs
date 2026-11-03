// Bundles the guides into the app (ADD-HELP-01), because a Worker can't read files at runtime. Run
// `npm run help:build` after changing a guide. A unit test fails if this file is out of date.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";

const folders = [
  ["docs/guides", ""],
  ["docs/runbooks", "runbook-"],
];

const content = {};
for (const [folder, prefix] of folders) {
  for (const name of readdirSync(folder).toSorted()) {
    if (name.endsWith(".md") && name !== "README.md") {
      content[`${prefix}${name.replace(/\.md$/, "")}`] = readFileSync(
        `${folder}/${name}`,
        "utf8",
      ).replace(/\r\n/g, "\n");
    }
  }
}

writeFileSync(
  "lib/generated/help-content.ts",
  `// Made by scripts/build-help.mjs from docs/guides and docs/runbooks. Don't edit this by hand.\nexport const HELP_CONTENT: Record<string, string> = ${JSON.stringify(content, null, 2)};\n`,
);
console.log(`Help: bundled ${Object.keys(content).length} guides.`);
