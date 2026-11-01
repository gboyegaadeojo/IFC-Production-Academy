/**
 * Calendars (decision record 9, stage 1): month grids and Winnipeg dates. Pure, so the volunteer
 * and scheduler calendars share them. Dates are "YYYY-MM-DD" strings in Winnipeg time, months
 * "YYYY-MM".
 */
import { TIME_ZONE } from "./schedule";

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH = /^(\d{4})-(\d{2})$/;

/** The Winnipeg calendar date of an instant: "2026-11-08". */
export function winnipegDate(instant: string | Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(typeof instant === "string" ? new Date(instant) : instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Calendar arithmetic on plain dates, without time zones. */
export function addDays(date: string, days: number): string {
  const match = DATE.exec(date);
  if (!match) {
    throw new Error("Invalid date");
  }
  const value = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days));
  return value.toISOString().slice(0, 10);
}

/** A valid "YYYY-MM", or the fallback. */
export function parseMonth(value: unknown, fallback: string): string {
  if (typeof value === "string") {
    const match = MONTH.exec(value);
    if (match && Number(match[2]) >= 1 && Number(match[2]) <= 12) {
      return value;
    }
  }
  return fallback;
}

/** A valid "YYYY-MM-DD" (a real day), or null. */
export function parseDate(value: unknown): string | null {
  if (typeof value !== "string" || !DATE.test(value)) {
    return null;
  }
  return addDays(value, 0) === value ? value : null;
}

export function shiftMonth(month: string, delta: number): string {
  const [year, m] = month.split("-").map(Number) as [number, number];
  const value = new Date(Date.UTC(year, m - 1 + delta, 1));
  return value.toISOString().slice(0, 7);
}

/** "November 2026". */
export function monthLabel(month: string): string {
  const [year, m] = month.split("-").map(Number) as [number, number];
  return new Intl.DateTimeFormat("en-CA", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, m - 1, 1)));
}

/** "Sunday, November 8". */
export function dayLabel(date: string): string {
  const [year, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Intl.DateTimeFormat("en-CA", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, m - 1, d)));
}

/** Whole weeks, Sunday first, covering the month. Days outside the month are included. */
export function monthGrid(month: string): string[][] {
  const first = `${month}-01`;
  const [year, m] = month.split("-").map(Number) as [number, number];
  const weekday = new Date(Date.UTC(year, m - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, m, 0)).getUTCDate();
  const start = addDays(first, -weekday);
  const weeks = Math.ceil((weekday + daysInMonth) / 7);
  return Array.from({ length: weeks }, (_, week) =>
    Array.from({ length: 7 }, (_, day) => addDays(start, week * 7 + day)),
  );
}

/** The first and last day shown on a month's grid, for loading what falls in it. */
export function gridRange(month: string): { from: string; to: string } {
  const grid = monthGrid(month);
  return { from: grid[0]![0]!, to: grid.at(-1)!.at(-1)! };
}

/** Every `everyWeeks` weeks from the first date, `count` dates in all. */
export function repeatingDates(first: string, count: number, everyWeeks = 1): string[] {
  return Array.from({ length: count }, (_, index) => addDays(first, index * 7 * everyWeeks));
}

/** Whether an away period covers a date. */
export function isAway(date: string, away: readonly { startsOn: string; endsOn: string }[]) {
  return away.some((period) => period.startsOn <= date && date <= period.endsOn);
}
