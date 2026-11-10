/**
 * Blockout dates, as in Planning Center (plan "Academy scheduling", PR 7): one day, a date range,
 * part of a day, or repeating on the first day's weekday until a date. Each can have a reason.
 * The database applies the same rules (private.blockout_for); these are for forms and calendars.
 */
import { z } from "zod";

export const BLOCKOUT_KINDS = ["day", "range", "partial", "repeating"] as const;
export type BlockoutKind = (typeof BLOCKOUT_KINDS)[number];

export const BLOCKOUT_KIND_LABELS: Record<BlockoutKind, string> = {
  day: "One day",
  range: "Date range",
  partial: "Part of a day",
  repeating: "Repeating",
};

export const REPEAT_RULES = [
  "weekly",
  "every_other_week",
  "first",
  "second",
  "third",
  "fourth",
  "last",
] as const;
export type RepeatRule = (typeof REPEAT_RULES)[number];

/** A blockout as stored: dates are Winnipeg days, times Winnipeg "HH:MM". */
export type Blockout = {
  startsOn: string;
  endsOn: string;
  startTime: string | null;
  endTime: string | null;
  repeat: RepeatRule | null;
  note: string;
};

const WEEKDAY = new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", weekday: "long" });
const SHORT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "UTC",
  weekday: "short",
  month: "short",
  day: "numeric",
});
const CLOCK = new Intl.DateTimeFormat("en-CA", {
  timeZone: "UTC",
  hour: "numeric",
  minute: "2-digit",
});

const utcNoon = (date: string) => new Date(`${date}T12:00:00Z`);
const clock = (time: string) => CLOCK.format(new Date(`2000-01-01T${time}:00Z`));

/** "Every Sunday", "Every other Sunday", "1st Sunday of each month", "Last Sunday of each month". */
export function repeatLabel(rule: RepeatRule, anchor: string): string {
  const day = WEEKDAY.format(utcNoon(anchor));
  switch (rule) {
    case "weekly":
      return `Every ${day}`;
    case "every_other_week":
      return `Every other ${day}`;
    case "last":
      return `Last ${day} of each month`;
    default:
      return `${{ first: "1st", second: "2nd", third: "3rd", fourth: "4th" }[rule]} ${day} of each month`;
  }
}

/** How a blockout reads in a list. */
export function blockoutLabel(blockout: Blockout): string {
  const from = SHORT.format(utcNoon(blockout.startsOn));
  if (blockout.repeat) {
    return `${repeatLabel(blockout.repeat, blockout.startsOn)}, from ${from} to ${SHORT.format(utcNoon(blockout.endsOn))}`;
  }
  if (blockout.startTime && blockout.endTime) {
    return `${from}, ${clock(blockout.startTime)} to ${clock(blockout.endTime)}`;
  }
  return blockout.startsOn === blockout.endsOn
    ? from
    : `${from} to ${SHORT.format(utcNoon(blockout.endsOn))}`;
}

/** Whether a repeating rule falls on a date (on the first day's weekday). */
export function repeatFallsOn(rule: RepeatRule, anchor: string, date: string): boolean {
  const day = utcNoon(date);
  const start = utcNoon(anchor);
  if (day.getUTCDay() !== start.getUTCDay()) {
    return false;
  }
  const dayOfMonth = day.getUTCDate();
  switch (rule) {
    case "weekly":
      return true;
    case "every_other_week":
      return Math.round((day.getTime() - start.getTime()) / 86_400_000 / 7) % 2 === 0;
    case "first":
      return dayOfMonth <= 7;
    case "second":
      return dayOfMonth > 7 && dayOfMonth <= 14;
    case "third":
      return dayOfMonth > 14 && dayOfMonth <= 21;
    case "fourth":
      return dayOfMonth > 21 && dayOfMonth <= 28;
    case "last": {
      const nextWeek = new Date(day.getTime() + 7 * 86_400_000);
      return nextWeek.getUTCMonth() !== day.getUTCMonth();
    }
  }
}

/** Whether a blockout falls on a Winnipeg date at all (for calendars). */
export function blocksDate(blockout: Blockout, date: string): boolean {
  if (date < blockout.startsOn || date > blockout.endsOn) {
    return false;
  }
  return blockout.repeat ? repeatFallsOn(blockout.repeat, blockout.startsOn, date) : true;
}

/**
 * Whether a blockout covers a service on a Winnipeg date between two Winnipeg times. A
 * part-of-a-day blockout counts only when it overlaps the service.
 */
export function blocksService(
  blockout: Blockout,
  date: string,
  serviceStart: string,
  serviceEnd: string,
): boolean {
  if (!blocksDate(blockout, date)) {
    return false;
  }
  if (blockout.startTime && blockout.endTime) {
    return blockout.startTime < serviceEnd && blockout.endTime > serviceStart;
  }
  return true;
}

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date.");
const time = z.string().regex(/^\d{2}:\d{2}$/, "Choose a time.");
const note = z.string().trim().max(200, "Keep the reason under 200 characters.");

/** What the blockout form sends, to what the database takes. */
export const blockoutSchema = z
  .discriminatedUnion("kind", [
    z.object({ kind: z.literal("day"), startsOn: day, note }),
    z.object({ kind: z.literal("range"), startsOn: day, endsOn: day, note }),
    z.object({
      kind: z.literal("partial"),
      startsOn: day,
      startTime: time,
      endTime: time,
      note,
    }),
    z.object({
      kind: z.literal("repeating"),
      startsOn: day,
      endsOn: day,
      repeat: z.enum(REPEAT_RULES),
      note,
    }),
  ])
  .transform((value, context): Blockout => {
    const endsOn =
      value.kind === "range" || value.kind === "repeating" ? value.endsOn : value.startsOn;
    if (endsOn < value.startsOn) {
      context.addIssue({ code: "custom", message: "The last day can't be before the first." });
      return z.NEVER;
    }
    if (Date.parse(endsOn) - Date.parse(value.startsOn) > 366 * 86_400_000) {
      context.addIssue({ code: "custom", message: "Keep it within a year." });
      return z.NEVER;
    }
    if (value.kind === "partial" && value.endTime <= value.startTime) {
      context.addIssue({ code: "custom", message: "The end time needs to be after the start." });
      return z.NEVER;
    }
    return {
      startsOn: value.startsOn,
      endsOn,
      startTime: value.kind === "partial" ? value.startTime : null,
      endTime: value.kind === "partial" ? value.endTime : null,
      repeat: value.kind === "repeating" ? value.repeat : null,
      note: value.note,
    };
  });

const TILE_MONTH = new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", month: "short" });

/** The small calendar tile beside a blockout: its first day's month and day, as "NOV" and "29". */
export function blockoutTile(startsOn: string): { month: string; day: string } {
  const date = new Date(`${startsOn}T12:00:00Z`);
  return {
    month: TILE_MONTH.format(date).replace(".", "").toUpperCase(),
    day: String(date.getUTCDate()),
  };
}
