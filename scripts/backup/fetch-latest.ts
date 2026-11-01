/**
 * Downloads the newest complete backup from the Shared Drive, for the restore test. Usage:
 *   node scripts/backup/fetch-latest.ts <out-dir>
 * Writes the three files and prints only the backup's age in hours.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { backupNames, latestCompleteStamp } from "../../lib/domain/backup.ts";
import { downloadFile, driveConfigured, driveToken, listFolder } from "./drive.ts";

async function main(): Promise<void> {
  const out = process.argv[2];
  const folderId = process.env.GDRIVE_FOLDER_ID ?? "";
  if (!out || !driveConfigured() || !folderId) {
    throw new Error("fetch-latest: a folder, a Google sign-in, and GDRIVE_FOLDER_ID are needed");
  }
  const token = await driveToken();
  const files = await listFolder(token, folderId);
  const stamp = latestCompleteStamp(files.map((f) => f.name));
  if (!stamp) {
    throw new Error("No complete backup found in the Shared Drive");
  }
  mkdirSync(out, { recursive: true });
  const names = backupNames(stamp);
  for (const name of [names.db, names.files, names.checksums]) {
    const file = files.find((f) => f.name === name);
    if (file) {
      writeFileSync(join(out, name), await downloadFile(token, file.id));
    }
  }
  const taken = Date.parse(`${stamp.slice(0, 13)}:${stamp.slice(13, 15)}:00Z`);
  console.log(`Latest backup is ${Math.round((Date.now() - taken) / 3_600_000)} hours old.`);
  // The stamp is a time, not data; later steps use it to find the files.
  const githubOutput = process.env.GITHUB_OUTPUT;
  if (githubOutput) {
    const { appendFileSync } = await import("node:fs");
    appendFileSync(githubOutput, `stamp=${stamp}\n`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Fetching the backup failed");
  process.exit(1);
});
