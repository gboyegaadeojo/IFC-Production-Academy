/**
 * Feature flags (ADD-FLAG-01; docs/decisions/2026-11-08-team-messaging.md). The same fixed list of
 * keys as the database's check, so code can't ask about a misspelled feature. A module that's off is
 * hidden here and refused by the database.
 */
export const FEATURES = [
  {
    key: "messaging",
    name: "Messages",
    description:
      "Department chats, group chats, and direct messages with photos. When it's on, Messages joins the bottom bar and the side bar for everyone.",
  },
] as const;

export type FeatureKey = (typeof FEATURES)[number]["key"];

export type FeatureFlags = Record<FeatureKey, boolean>;

export function isFeatureKey(value: unknown): value is FeatureKey {
  return FEATURES.some((feature) => feature.key === value);
}

/** Every feature, off unless a row says it's on. Unknown rows are ignored. */
export function featureFlagsFrom(rows: readonly { key: string; enabled: boolean }[]): FeatureFlags {
  const flags = Object.fromEntries(FEATURES.map((feature) => [feature.key, false])) as FeatureFlags;
  for (const row of rows) {
    if (isFeatureKey(row.key)) {
      flags[row.key] = row.enabled;
    }
  }
  return flags;
}
