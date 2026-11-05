/**
 * Who has phone alerts on (decision 2026-11-05). Pure rules for the list leaders see. A phone can be
 * switched off in its own settings without the app knowing until a send fails, so "on" means the
 * last we heard.
 */
export type AlertStatus = "on" | "computer_only" | "off" | "cannot";

export const ALERT_STATUS_LABELS: Record<AlertStatus, string> = {
  on: "On",
  computer_only: "Computer only",
  off: "Not on",
  cannot: "Phone can't",
};

// Who to follow up with comes first.
const ORDER: Record<AlertStatus, number> = { off: 0, computer_only: 1, cannot: 2, on: 3 };

export function toAlertStatus(value: string): AlertStatus {
  return value === "on" || value === "computer_only" || value === "cannot" ? value : "off";
}

export function sortForFollowUp<T extends { status: AlertStatus; displayName: string }>(
  people: readonly T[],
): T[] {
  return people.toSorted(
    (a, b) =>
      ORDER[a.status] - ORDER[b.status] || a.displayName.localeCompare(b.displayName, "en-CA"),
  );
}

/** "3 of 12 have alerts on a phone". */
export function alertSummary(people: readonly { status: AlertStatus }[]): string {
  const on = people.filter((person) => person.status === "on").length;
  return `${on} of ${people.length} ${on === 1 ? "has" : "have"} alerts on a phone`;
}
