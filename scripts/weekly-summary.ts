/**
 * Weekly summary (CLAUDE.md "Scheduled jobs", SPEC §9 "Keep-alive design"). Reads when each
 * scheduled job last ran and last succeeded, writes status/last-run.json (timestamps, success
 * flags, and backup sizes only: no counts of people, no names), and emails the admins if Resend
 * is set up. Exits 1 when the keep-alive or backup hasn't succeeded for two days, so the failure
 * alert fires.
 *
 * Env: GITHUB_TOKEN, GITHUB_REPOSITORY, and optionally RESEND_API_KEY, ALERT_EMAILS, ALERT_FROM,
 * GDRIVE_SERVICE_ACCOUNT_JSON, GDRIVE_FOLDER_ID (for backup sizes), BACKUPS_ENABLED.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { backupNames, latestCompleteStamp } from "../lib/domain/backup.ts";
import { driveConfigured, driveToken, listFolder } from "./backup/drive.ts";

const WORKFLOWS = [
  { file: "keepalive.yml", label: "Keep-alive", staleAfterHours: 48 },
  { file: "backup.yml", label: "Nightly backup", staleAfterHours: 48 },
  { file: "restore-test.yml", label: "Monthly restore test", staleAfterHours: 24 * 40 },
  { file: "notifications.yml", label: "Notification emails", staleAfterHours: 24 },
] as const;

type Run = { conclusion: string | null; updated_at: string; event: string };

const env = (name: string) => process.env[name]?.trim() ?? "";

async function runs(file: string): Promise<Run[]> {
  const response = await fetch(
    `https://api.github.com/repos/${env("GITHUB_REPOSITORY")}/actions/workflows/${file}/runs?per_page=50&exclude_pull_requests=true`,
    {
      headers: {
        Authorization: `Bearer ${env("GITHUB_TOKEN")}`,
        Accept: "application/vnd.github+json",
      },
    },
  );
  // A workflow that hasn't reached the default branch yet has no runs.
  if (response.status === 404) {
    return [];
  }
  if (!response.ok) {
    throw new Error(`Reading ${file} runs failed with HTTP ${response.status}`);
  }
  return ((await response.json()) as { workflow_runs: Run[] }).workflow_runs;
}

async function backupSizes(): Promise<{ db: number; files: number } | null> {
  const folder = env("GDRIVE_FOLDER_ID");
  if (!driveConfigured() || !folder) {
    return null;
  }
  const files = await listFolder(await driveToken(), folder);
  const stamp = latestCompleteStamp(files.map((f) => f.name));
  if (!stamp) {
    return null;
  }
  const names = backupNames(stamp);
  return {
    db: files.find((f) => f.name === names.db)?.size ?? 0,
    files: files.find((f) => f.name === names.files)?.size ?? 0,
  };
}

async function main(): Promise<void> {
  const now = Date.now();
  const backupsEnabled = env("BACKUPS_ENABLED") === "true";
  const jobs: Record<
    string,
    { last_run: string | null; last_success: string | null; ok: boolean }
  > = {};
  const problems: string[] = [];
  for (const workflow of WORKFLOWS) {
    const list = await runs(workflow.file);
    const lastRun = list[0]?.updated_at ?? null;
    const lastSuccess = list.find((run) => run.conclusion === "success")?.updated_at ?? null;
    const age = lastSuccess ? (now - Date.parse(lastSuccess)) / 3_600_000 : Infinity;
    const expected =
      workflow.file === "keepalive.yml" ||
      ((workflow.file === "backup.yml" || workflow.file === "restore-test.yml") && backupsEnabled);
    const ok = !expected || age <= workflow.staleAfterHours;
    jobs[workflow.file.replace(".yml", "")] = { last_run: lastRun, last_success: lastSuccess, ok };
    if (!ok) {
      problems.push(
        `${workflow.label}: no successful run in the last ${workflow.staleAfterHours} hours`,
      );
    }
  }

  let sizes: { db: number; files: number } | null = null;
  try {
    sizes = await backupSizes();
  } catch {
    problems.push("Backup sizes could not be read from the Shared Drive");
  }

  const status = {
    generated_at: new Date(now).toISOString(),
    jobs,
    latest_backup_bytes: sizes,
    healthy: problems.length === 0,
  };
  mkdirSync("status", { recursive: true });
  writeFileSync("status/last-run.json", `${JSON.stringify(status, null, 2)}\n`);
  console.log(
    `Weekly summary: ${problems.length === 0 ? "all healthy" : `${problems.length} problem(s)`}.`,
  );

  const resendKey = env("RESEND_API_KEY");
  const to = env("ALERT_EMAILS");
  const from = env("ALERT_FROM");
  if (resendKey && to && from) {
    const lines = WORKFLOWS.map((workflow) => {
      const job = jobs[workflow.file.replace(".yml", "")];
      return `${job?.ok ? "OK " : "!! "} ${workflow.label}: last success ${job?.last_success ?? "never"}`;
    });
    const text = [
      problems.length === 0 ? "Everything ran as expected this week." : "Needs attention:",
      ...problems.map((p) => `- ${p}`),
      "",
      ...lines,
      "",
      sizes
        ? `Latest backup: database ${sizes.db} bytes, files ${sizes.files} bytes.`
        : "Backups: not set up yet.",
    ].join("\n");
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: to
          .split(",")
          .map((a) => a.trim())
          .filter(Boolean),
        subject: `IFC Academy weekly summary: ${problems.length === 0 ? "all healthy" : "needs attention"}`,
        text,
      }),
    });
    console.log(`Summary email: HTTP ${response.status}`);
  } else {
    console.log("Summary email: Resend is not set up, so none was sent.");
  }

  if (problems.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Weekly summary failed");
  process.exitCode = 1;
});
