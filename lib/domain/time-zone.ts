/**
 * Winnipeg time, as the Academy shows it. Manitoba stopped turning its clocks back on 2026-11-01
 * and stays at UTC−5 all year (IANA tz 2026e). Supabase's Postgres, and JavaScript runtimes with
 * older time zone data, still used the old rule and showed times an hour early, so the Academy
 * names the fixed offset instead of "America/Winnipeg" (G, 2026-11-10). In these names the sign is
 * reversed: "Etc/GMT+5" is UTC−5. Every Academy record dates from October 2026 or later, when
 * Winnipeg was already at UTC−5, so no stored time moves.
 */
export const TIME_ZONE = "Etc/GMT+5";

/** Winnipeg's official rule, as the runtime's time zone data has it. Only for the check below. */
const OFFICIAL_ZONE = "America/Winnipeg";
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Whether Winnipeg's official rule differs from the fixed offset at any point in the next year,
 * by this runtime's time zone data. The weekly summary runs it on GitHub, whose Node is kept
 * current, so a new law shows up there before it reaches anyone's screen.
 */
export function winnipegRuleChanged(
  now: Date = new Date(),
  officialZone: string = OFFICIAL_ZONE,
): boolean {
  const clock = (zone: string) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      hourCycle: "h23",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  const official = clock(officialZone);
  const fixed = clock(TIME_ZONE);
  for (let week = 0; week <= 52; week++) {
    const instant = new Date(now.getTime() + week * 7 * DAY_MS);
    if (official.format(instant) !== fixed.format(instant)) {
      return true;
    }
  }
  return false;
}
