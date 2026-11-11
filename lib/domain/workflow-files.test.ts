import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The scheduled jobs fetch only the files they list (sparse checkout), so a script that starts
 * importing a new file fails at night with "module not found". This follows each script's
 * imports and checks every file is listed. The email job broke this way on 2026-11-05.
 */
function sparseFiles(workflow: string): string[] {
  const text = readFileSync(workflow, "utf8").replace(/\r\n/g, "\n");
  const match = text.match(/sparse-checkout: \|\n((?: {12}\S.*\n)+)/);
  return match
    ? match[1]!
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
    : [];
}

function scriptsRun(workflow: string): string[] {
  const text = readFileSync(workflow, "utf8");
  return [...text.matchAll(/node (scripts\/[\w.-]+\.ts)/g)].map((m) => m[1]!);
}

function localImports(file: string, seen = new Set<string>()): Set<string> {
  if (seen.has(file)) {
    return seen;
  }
  seen.add(file);
  const text = readFileSync(file, "utf8");
  for (const match of text.matchAll(/^import [^;]*? from "(\.{1,2}\/[^"]+)";/gm)) {
    localImports(normalize(join(dirname(file), match[1]!)).replaceAll("\\", "/"), seen);
  }
  return seen;
}

describe("scheduled jobs fetch every file their scripts need", () => {
  const workflows = readdirSync(".github/workflows")
    .filter((name) => name.endsWith(".yml"))
    .map((name) => `.github/workflows/${name}`)
    .filter((path) => sparseFiles(path).length > 0 && scriptsRun(path).length > 0);

  it.each(workflows)("%s", (workflow) => {
    const listed = sparseFiles(workflow);
    const covered = (file: string) =>
      listed.some((entry) => file === entry || file.startsWith(`${entry.replace(/\/$/, "")}/`));
    const needed = scriptsRun(workflow).flatMap((script) => [...localImports(script)]);
    expect(needed.filter((file) => !covered(file))).toEqual([]);
  });
});

/**
 * Failure alerts go out once per problem, and again when it's fixed (health check, 2026-11-10).
 * That needs the alert step to run after every run, with the run's result, and permission to look
 * up the previous run. The weekly summary emails every failure on purpose.
 */
describe("failure alerts email once per problem", () => {
  const workflows = readdirSync(".github/workflows")
    .filter((name) => name.endsWith(".yml") && name !== "weekly-summary.yml")
    .map((name) => `.github/workflows/${name}`)
    .filter((path) => readFileSync(path, "utf8").includes("notify-failure"));

  it.each(workflows)("%s", (workflow) => {
    const text = readFileSync(workflow, "utf8").replace(/\r\n/g, "\n");
    const step = text.slice(text.indexOf("- name: Email the admins"));
    expect(step).toMatch(/^- name: Email the admins\n\s+if: always\(\)/);
    expect(step).toContain("outcome: ${{ job.status }}");
    expect(text).toMatch(/\n\s+actions: read/);
  });
});
