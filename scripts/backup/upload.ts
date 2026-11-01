/**
 * Uploads tonight's encrypted backup to the Shared Drive, then deletes copies outside the
 * retention rule (30 daily, 12 weekly, 12 monthly). Usage:
 *   node scripts/backup/upload.ts <dir> <stamp>
 * where <dir> holds the three files named by backupNames(<stamp>). Needs
 * GDRIVE_SERVICE_ACCOUNT_JSON and GDRIVE_FOLDER_ID. Logs sizes, counts, and timings only.
 */
import { statSync } from "node:fs";
import { join } from "node:path";
import { backupNames, filesToDelete } from "../../lib/domain/backup.ts";
import { deleteFile, driveConfigured, driveToken, listFolder, uploadFile } from "./drive.ts";

async function main(): Promise<void> {
  const [dir, stamp] = process.argv.slice(2);
  const folderId = process.env.GDRIVE_FOLDER_ID ?? "";
  if (!dir || !stamp || !driveConfigured() || !folderId) {
    throw new Error("upload: a folder, a stamp, a Google sign-in, and GDRIVE_FOLDER_ID are needed");
  }
  const started = Date.now();
  const token = await driveToken();
  const names = backupNames(stamp);
  for (const name of [names.db, names.files, names.checksums]) {
    const path = join(dir, name);
    await uploadFile(token, folderId, path, name);
    const label = name === names.db ? "database" : name === names.files ? "files" : "checksums";
    console.log(`Uploaded ${label} (${statSync(path).size} bytes).`);
  }
  const existing = await listFolder(token, folderId);
  const expired = filesToDelete(existing.map((f) => f.name));
  for (const file of existing.filter((f) => expired.includes(f.name))) {
    await deleteFile(token, file.id);
  }
  console.log(
    `Retention: ${existing.length - expired.length} files kept, ${expired.length} deleted. Took ${Date.now() - started} ms.`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Upload failed");
  process.exit(1);
});
