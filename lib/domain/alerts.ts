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

// ---------------------------------------------------------------------------
// Who has the app, and alerts switched off by kind (G, 2026-11-10)
// ---------------------------------------------------------------------------

export type AppPlatform = "iphone" | "android" | "computer";

export const APP_PLATFORM_LABELS: Record<AppPlatform, string> = {
  iphone: "iPhone",
  android: "Android",
  computer: "Computer",
};

/** The kind of device the installed app is open on. iPads report as a Mac, but with touch. */
export function appPlatformFrom(userAgent: string, maxTouchPoints: number): AppPlatform {
  if (/iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1)) {
    return "iphone";
  }
  return /Android/.test(userAgent) ? "android" : "computer";
}

export function isAppPlatform(value: string): value is AppPlatform {
  return value === "iphone" || value === "android" || value === "computer";
}

/** The groups someone has switched any alert off in, for their phone: "Training". */
export function alertsOffFor(
  kinds: readonly string[],
  groups: readonly { title: string; kinds: readonly string[] }[],
): string[] {
  const off = new Set(kinds);
  return groups.filter((group) => group.kinds.some((kind) => off.has(kind))).map((g) => g.title);
}

/** What the leaders' list shows for alerts: as before, or "some off" when alerts are on but not all. */
export type AlertShown = AlertStatus | "some";

export function alertShown(status: AlertStatus, offGroups: readonly string[]): AlertShown {
  return status === "on" && offGroups.length > 0 ? "some" : status;
}

export const ALERT_SHOWN_LABELS: Record<AlertShown, string> = {
  ...ALERT_STATUS_LABELS,
  some: "Some off",
};

export type TeamFilter = "all" | "no_app" | "not_on" | "some_off" | "cannot";

/** Whether a person belongs under a filter on the leaders' list. */
export function inTeamFilter(
  filter: TeamFilter,
  person: { hasApp: boolean; shown: AlertShown },
): boolean {
  switch (filter) {
    case "no_app":
      return !person.hasApp;
    case "not_on":
      return person.shown === "off" || person.shown === "computer_only";
    case "some_off":
      return person.shown === "some";
    case "cannot":
      return person.shown === "cannot";
    default:
      return true;
  }
}
