/**
 * Fails if a migration this change adds isn't dated after every migration on the base branch
 * (lib/domain/migration-order.ts). Usage: node scripts/check-migration-order.ts <base-ref>
 * Prints file names only.
 */
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { migrationOrderProblems } from "../lib/domain/migration-order.ts";

const baseRef = process.argv[2];
if (!baseRef) {
  console.error("Usage: node scripts/check-migration-order.ts <base-ref>");
  process.exit(2);
}

const baseFiles = execFileSync("git", ["ls-tree", "--name-only", baseRef, "supabase/migrations/"], {
  encoding: "utf8",
})
  .split("\n")
  .map((line) => line.trim().replace(/^supabase\/migrations\//, ""))
  .filter((name) => name.endsWith(".sql"));
const headFiles = readdirSync("supabase/migrations").filter((name) => name.endsWith(".sql"));

const problems = migrationOrderProblems(baseFiles, headFiles);
for (const problem of problems) {
  console.error(`supabase/migrations/${problem.file} ${problem.reason}`);
}
if (problems.length > 0) {
  process.exit(1);
}
console.log(`Migration order OK (${headFiles.length - baseFiles.length} new).`);
