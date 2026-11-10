/**
 * Winnipeg time, as the Academy shows it. Manitoba stopped turning its clocks back on 2026-11-01
 * and stays at UTC−5 all year (IANA tz 2026e). Supabase's Postgres, and JavaScript runtimes with
 * older time zone data, still used the old rule and showed times an hour early, so the Academy
 * names the fixed offset instead of "America/Winnipeg" (G, 2026-11-10). In these names the sign is
 * reversed: "Etc/GMT+5" is UTC−5. Every Academy record dates from October 2026 or later, when
 * Winnipeg was already at UTC−5, so no stored time moves.
 */
export const TIME_ZONE = "Etc/GMT+5";
