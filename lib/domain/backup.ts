/**
 * Backup naming and retention (SPEC §9 "Backup design"). No imports, so the backup scripts can run
 * this file directly with Node's built-in TypeScript support.
 *
 * Files are academy-db-<stamp>.dump.age, academy-files-<stamp>.zip.age, and
 * academy-<stamp>.sha256, where <stamp> is the UTC time like 2026-11-02T0800Z. Copies are kept
 * for 30 days, plus 12 Sundays and 12 first-of-the-month copies; everything else is deleted.
 */

export const BACKUP_FILE =
  /^academy-(?:db-|files-)?(\d{4}-\d{2}-\d{2}T\d{4}Z)\.(?:dump\.age|zip\.age|sha256)$/;

/** "2026-11-02T0800Z" for an instant. */
export function backupStamp(date: Date): string {
  const iso = date.toISOString();
  return `${iso.slice(0, 13)}${iso.slice(14, 16)}Z`;
}

export function backupNames(stamp: string): { db: string; files: string; checksums: string } {
  return {
    db: `academy-db-${stamp}.dump.age`,
    files: `academy-files-${stamp}.zip.age`,
    checksums: `academy-${stamp}.sha256`,
  };
}

/** The stamp a backup file belongs to, or null for anything else in the folder. */
export function stampOf(fileName: string): string | null {
  return BACKUP_FILE.exec(fileName)?.[1] ?? null;
}

function dayOf(stamp: string): string {
  return stamp.slice(0, 10);
}

/**
 * Which backup stamps to keep. Within a day only the newest copy counts. Keeps the newest copy of
 * each of the last 30 days that have one, of the last 12 Sundays, and of the last 12 first days of
 * the month (all UTC dates).
 */
export function stampsToKeep(stamps: readonly string[]): Set<string> {
  const newestPerDay = new Map<string, string>();
  for (const stamp of stamps) {
    const day = dayOf(stamp);
    const current = newestPerDay.get(day);
    if (!current || stamp > current) {
      newestPerDay.set(day, stamp);
    }
  }
  const days = [...newestPerDay.keys()].toSorted().toReversed();
  const keep = new Set<string>();
  const add = (list: string[], count: number) => {
    for (const day of list.slice(0, count)) {
      const stamp = newestPerDay.get(day);
      if (stamp) {
        keep.add(stamp);
      }
    }
  };
  add(days, 30);
  add(
    days.filter((day) => new Date(`${day}T00:00:00Z`).getUTCDay() === 0),
    12,
  );
  add(
    days.filter((day) => day.endsWith("-01")),
    12,
  );
  return keep;
}

/** File names to delete from the backup folder, given everything in it. */
export function filesToDelete(fileNames: readonly string[]): string[] {
  const stamps = fileNames.flatMap((name) => {
    const stamp = stampOf(name);
    return stamp ? [stamp] : [];
  });
  const keep = stampsToKeep(stamps);
  return fileNames.filter((name) => {
    const stamp = stampOf(name);
    return stamp !== null && !keep.has(stamp);
  });
}

/** The newest complete backup (database and files both present), for the restore test. */
export function latestCompleteStamp(fileNames: readonly string[]): string | null {
  const stamps = new Set(fileNames.flatMap((name) => stampOf(name) ?? []));
  return (
    [...stamps]
      .toSorted()
      .toReversed()
      .find((stamp) => {
        const names = backupNames(stamp);
        return fileNames.includes(names.db) && fileNames.includes(names.files);
      }) ?? null
  );
}
