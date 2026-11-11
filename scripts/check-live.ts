/**
 * The check after every deploy (deploy.yml; health check, 2026-11-10). Waits for the new version to
 * be live, then checks public pages load, private pages redirect signed-out visitors, and the
 * database API answers the keep-alive and the Planning Center sync's check, which is what broke on
 * 2026-11-09. Logs status codes and timings only, never page content or values.
 *
 * Needs SITE_URL and GITHUB_SHA; SUPABASE_URL with SUPABASE_PUBLISHABLE_KEY and
 * SUPABASE_SERVICE_ROLE_KEY for the API checks, which are skipped without them.
 */
import {
  PRIVATE_PAGES,
  PUBLIC_PAGES,
  pageProblem,
  versionProblem,
  type PageResult,
} from "../lib/domain/live-check.ts";
import { supabaseKeyHeaders } from "../lib/domain/supabase-keys.ts";

const env = (name: string) => process.env[name]?.trim() ?? "";
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function page(base: string, path: string): Promise<PageResult> {
  const response = await fetch(`${base}${path}`, {
    redirect: "manual",
    signal: AbortSignal.timeout(30_000),
  });
  return {
    path,
    status: response.status,
    body: await response.text(),
    location: response.headers.get("location"),
  };
}

async function liveVersion(base: string): Promise<string> {
  try {
    const response = await fetch(`${base}/api/version`, { signal: AbortSignal.timeout(15_000) });
    const body = (await response.json()) as { version?: unknown };
    return typeof body.version === "string" ? body.version : "";
  } catch {
    return "";
  }
}

/** An API function's HTTP status, called the way the app and the jobs call it. */
async function rpc(url: string, key: string, name: string): Promise<number> {
  const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { ...supabaseKeyHeaders(key), "Content-Type": "application/json" },
    body: "{}",
    signal: AbortSignal.timeout(30_000),
  });
  await response.body?.cancel();
  return response.status;
}

async function main(): Promise<void> {
  const base = env("SITE_URL").replace(/\/+$/, "");
  const commit = env("GITHUB_SHA");
  if (!base || !commit) {
    throw new Error("SITE_URL and GITHUB_SHA are needed.");
  }
  const problems: string[] = [];

  // Cloudflare takes a little while to serve a new version everywhere.
  let version = "";
  for (let attempt = 1; attempt <= 12; attempt++) {
    version = await liveVersion(base);
    if (!versionProblem(version, commit)) {
      break;
    }
    await sleep(10_000);
  }
  const versionIssue = versionProblem(version, commit);
  console.log(`Version: ${versionIssue ? "not live yet" : "live"}`);
  if (versionIssue) {
    problems.push(versionIssue);
  }

  for (const [kind, paths] of [
    ["public", PUBLIC_PAGES],
    ["private", PRIVATE_PAGES],
  ] as const) {
    for (const path of paths) {
      const started = Date.now();
      const result = await page(base, path).catch((): PageResult => ({
        path,
        status: 0,
        body: "",
        location: null,
      }));
      const issue = pageProblem(kind, result);
      console.log(
        `${path}: HTTP ${result.status} in ${Date.now() - started} ms${issue ? " (problem)" : ""}`,
      );
      if (issue) {
        problems.push(issue);
      }
    }
  }

  const supabase = env("SUPABASE_URL").replace(/\/+$/, "");
  const publishable = env("SUPABASE_PUBLISHABLE_KEY");
  const service = env("SUPABASE_SERVICE_ROLE_KEY");
  if (supabase && publishable && service) {
    for (const [name, key] of [
      ["keepalive", publishable],
      ["planning_center_schedules", service],
    ] as const) {
      const status = await rpc(supabase, key, name).catch(() => 0);
      console.log(`API ${name}: HTTP ${status}`);
      if (status !== 200) {
        problems.push(`API ${name}: expected 200, got ${status}`);
      }
    }
  } else {
    console.log("API checks: skipped (Supabase secrets not set)");
  }

  if (problems.length > 0) {
    for (const problem of problems) {
      console.log(`::error::${problem}`);
    }
    process.exitCode = 1;
    return;
  }
  console.log("The live site passed every check.");
}

await main();
