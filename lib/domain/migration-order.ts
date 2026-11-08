/**
 * Migration order (team messaging decision, 2026-11-08). Many migrations already applied to
 * production are dated in the future, so they're never renamed. Instead every new migration must be
 * dated after the newest one already on main, or Supabase would apply it out of order. CI runs
 * scripts/check-migration-order.ts, which uses this.
 */
const NAME = /^(\d{14})_[a-z0-9_]+\.sql$/;

export type MigrationProblem = { file: string; reason: string };

/** Problems with the migrations a change adds, compared with those already on the base branch. */
export function migrationOrderProblems(
  baseFiles: readonly string[],
  headFiles: readonly string[],
): MigrationProblem[] {
  const base = new Set(baseFiles);
  const newest = baseFiles
    .map((file) => NAME.exec(file)?.[1])
    .filter((stamp): stamp is string => stamp !== undefined)
    .sort()
    .at(-1);
  const problems: MigrationProblem[] = [];
  const stamps = new Map<string, string>();
  for (const file of headFiles.filter((name) => !base.has(name)).sort()) {
    const stamp = NAME.exec(file)?.[1];
    if (!stamp) {
      problems.push({ file, reason: "isn't named YYYYMMDDHHMMSS_words.sql" });
      continue;
    }
    if (newest && stamp <= newest) {
      problems.push({
        file,
        reason: `must be dated after ${newest}, the newest migration on main`,
      });
    }
    const clash = stamps.get(stamp);
    if (clash) {
      problems.push({ file, reason: `has the same timestamp as ${clash}` });
    }
    stamps.set(stamp, file);
  }
  return problems;
}
