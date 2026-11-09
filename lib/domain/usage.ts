/**
 * How much of the Supabase free plan is used (ADD-MSG-05, G's answer 4 in the team messaging
 * decision): the weekly summary shows it and warns at 70%, well before anything stops working. No
 * imports, so the weekly summary script can run this file directly.
 */

export const FREE_PLAN_BYTES = {
  database: 500 * 1024 * 1024,
  storage: 1024 * 1024 * 1024,
} as const;

export const WARN_AT = 0.7;

export type Usage = { databaseBytes: number; storageBytes: number; chatFileBytes: number };

function megabytes(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

function percent(used: number, limit: number): number {
  return Math.round((used / limit) * 100);
}

/** One line for each, such as "Database: 21 MB of 500 MB (4%)". */
export function usageLines(usage: Usage): string[] {
  return [
    `Database: ${megabytes(usage.databaseBytes)} of 500 MB (${percent(usage.databaseBytes, FREE_PLAN_BYTES.database)}%)`,
    `Stored files: ${megabytes(usage.storageBytes)} of 1 GB (${percent(usage.storageBytes, FREE_PLAN_BYTES.storage)}%), of which chat files ${megabytes(usage.chatFileBytes)}`,
  ];
}

/** Warnings once either reaches 70% of the free plan, with what to do. */
export function usageWarnings(usage: Usage): string[] {
  const warnings: string[] = [];
  if (usage.databaseBytes >= FREE_PLAN_BYTES.database * WARN_AT) {
    warnings.push(
      `The database is at ${percent(usage.databaseBytes, FREE_PLAN_BYTES.database)}% of the free plan. Consider keeping message text for fewer years on Admin → Features.`,
    );
  }
  if (usage.storageBytes >= FREE_PLAN_BYTES.storage * WARN_AT) {
    warnings.push(
      `Stored files are at ${percent(usage.storageBytes, FREE_PLAN_BYTES.storage)}% of the free plan. Consider keeping chat photos and documents for fewer days on Admin → Features.`,
    );
  }
  return warnings;
}
