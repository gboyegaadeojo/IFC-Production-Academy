// Keeping every phone on the latest version (G, 2026-11-10: "it should work for any phone
// regardless"). An installed app on iPhone or Android can stay open for days on the version it
// started with, so it checks which version is live and loads it at a safe moment.

/** True when the live version is a different, known build from the one this page is running. */
export function isNewVersion(running: string | undefined, live: string | undefined): boolean {
  return Boolean(running) && Boolean(live) && running !== live;
}

/**
 * Whether to load the new version now: only when the app has just come back into view, and not
 * while someone is typing, so nothing they've entered is lost. Otherwise it waits for the next
 * move to another page. Never twice for the same version, so it can't loop.
 */
export function reloadNow(options: {
  stale: string | null;
  justReturned: boolean;
  typing: boolean;
  alreadyReloadedFor: string | null;
}): boolean {
  return (
    options.stale !== null &&
    options.justReturned &&
    !options.typing &&
    options.alreadyReloadedFor !== options.stale
  );
}
