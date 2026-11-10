// The number on the app's icon (badge A, G 2026-11-10): every unread notification and message
// together. Phones and computers that can show it get it; the rest simply don't. Android's Chrome
// shows its own dot for an alert waiting instead of a number.

/** What the browser offers, if anything (the Badging API). Pages and the service worker both have it. */
export type BadgeHost = {
  setAppBadge?: (count?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

/**
 * Shows `count` on the icon, or clears it at zero. Never throws: the icon is a nicety, and iPhones
 * refuse until alerts are allowed. Says whether the device took it.
 */
export async function applyAppBadge(count: number, host: BadgeHost): Promise<boolean> {
  try {
    if (count > 0 && host.setAppBadge) {
      await host.setAppBadge(Math.floor(count));
      return true;
    }
    if (count <= 0 && host.clearAppBadge) {
      await host.clearAppBadge();
      return true;
    }
  } catch {
    // Not allowed here, or not now.
  }
  return false;
}

/** Each device's number, from the database's push_badges, by push address. */
export function badgesByEndpoint(
  rows: readonly { endpoint: string; badge: number }[] | null | undefined,
): Map<string, number> {
  return new Map((rows ?? []).map((row) => [row.endpoint, row.badge]));
}
