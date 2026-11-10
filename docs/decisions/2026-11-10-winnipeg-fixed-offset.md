# Winnipeg time is a fixed UTC−5

**Date:** 2026-11-10 · **Decided by:** G

## Context

Manitoba stopped turning its clocks back on 1 November 2026 and stays at UTC−5 all year. The world
time zone database added this in release 2026e, but the systems the Academy runs on don't all have
it yet. On 10 November, Supabase's Postgres still treated Winnipeg as UTC−6. Reminder emails, the
times in notifications, and "which day is it" checks were therefore an hour early. JavaScript
runtimes with older data have the same problem.

## Decision

The Academy writes Winnipeg time as a fixed UTC−5 everywhere:

- TypeScript: `TIME_ZONE` from `lib/domain/time-zone.ts` (`"Etc/GMT+5"`).
- SQL: `at time zone 'Etc/GMT+5'`. Migration `20270119121400_winnipeg_fixed_offset` rewrote every
  database function that named `'America/Winnipeg'`.

In these names the sign is reversed: `Etc/GMT+5` is UTC−5.

## Consequences

- Times are right whichever time zone data a server has.
- No stored time moves. Every Academy record dates from October 2026 or later, when Winnipeg was
  already at UTC−5.
- If Manitoba ever changes its clocks again, change the one constant and the SQL name.
- `lib/domain/time-zone.test.ts` fails if a later migration uses `'America/Winnipeg'`, and pgTAP
  test 087 checks that no database function does.
