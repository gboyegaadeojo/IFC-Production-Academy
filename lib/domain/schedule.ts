/**
 * Scheduling (SRS-SCHED-001..011, SRS-COMP-005..008). Pure helpers: Winnipeg wall-clock times for
 * forms, labels, and validation. The database runs every competency, conflict, and availability
 * check when someone is assigned.
 */
import { z } from "zod";

export const TIME_ZONE = "America/Winnipeg";

/** The UTC offset in minutes of Winnipeg at an instant (−300 in summer, −360 in winter). */
function winnipegOffsetMinutes(instant: Date): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return Math.round((asUtc - instant.getTime()) / 60_000);
}

/** "2026-11-08" and "09:30" in Winnipeg to a UTC instant. Null if either is malformed. */
export function winnipegToUtc(date: string, time: string): Date | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const t = /^(\d{2}):(\d{2})$/.exec(time);
  if (!d || !t) {
    return null;
  }
  const [year, month, day, hour, minute] = [d[1], d[2], d[3], t[1], t[2]].map(Number) as [
    number,
    number,
    number,
    number,
    number,
  ];
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) {
    return null;
  }
  const naive = Date.UTC(year, month - 1, day, hour, minute);
  // Two passes settle the offset either side of a daylight-saving change.
  let instant = new Date(naive - winnipegOffsetMinutes(new Date(naive)) * 60_000);
  instant = new Date(naive - winnipegOffsetMinutes(instant) * 60_000);
  return Number.isNaN(instant.getTime()) ? null : instant;
}

/** The Winnipeg date and time of an instant, for form defaults: ["2026-11-08", "09:30"]. */
export function utcToWinnipeg(iso: string): [string, string] {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return [`${get("year")}-${get("month")}-${get("day")}`, `${get("hour")}:${get("minute")}`];
}

const DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  weekday: "short",
  month: "short",
  day: "numeric",
});
const TIME = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  hour: "numeric",
  minute: "2-digit",
});

/** "Sun, Nov 8 · 9:00 a.m. – 11:30 a.m." in Winnipeg time. */
export function eventTimeLabel(startsAt: string, endsAt: string): string {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  return `${DAY.format(start)} · ${TIME.format(start)} – ${TIME.format(end)}`;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export const eventSchema = z
  .object({
    title: z
      .string()
      .transform((value) => value.replace(/\s+/g, " ").trim())
      .pipe(z.string().min(1, "Give the event a name.").max(120, "Keep it under 120 characters.")),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date."),
    startTime: z.string().regex(/^\d{2}:\d{2}$/, "Choose a start time."),
    endTime: z.string().regex(/^\d{2}:\d{2}$/, "Choose an end time."),
    location: z.string().trim().max(120, "Keep the location under 120 characters."),
    notes: z.string().trim().max(1000, "Keep the notes under 1,000 characters."),
  })
  .transform((value, context) => {
    const startsAt = winnipegToUtc(value.date, value.startTime);
    const endsAt = winnipegToUtc(value.date, value.endTime);
    if (!startsAt || !endsAt) {
      context.addIssue({ code: "custom", message: "Check the date and times." });
      return z.NEVER;
    }
    if (endsAt.getTime() <= startsAt.getTime()) {
      context.addIssue({ code: "custom", message: "The end time needs to be after the start." });
      return z.NEVER;
    }
    return {
      title: value.title,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      location: value.location,
      notes: value.notes,
    };
  });

export const unavailabilitySchema = z
  .object({
    startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the first day."),
    endsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the last day."),
    note: z.string().trim().max(200, "Keep the note under 200 characters."),
  })
  .refine((value) => value.endsOn >= value.startsOn, {
    message: "The last day can't be before the first.",
  });

export const overrideReasonSchema = z
  .string()
  .trim()
  .max(300, "Keep the reason under 300 characters.");

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

export type AssignmentStatus = "pending" | "confirmed" | "declined" | "cancelled";
export type AssignmentReadiness = "approved" | "supervised" | "override";

export const ASSIGNMENT_STATUS_LABELS: Record<AssignmentStatus, string> = {
  pending: "Waiting for a reply",
  confirmed: "Confirmed",
  declined: "Declined",
  cancelled: "Cancelled",
};

export const READINESS_LABELS: Record<AssignmentReadiness, string> = {
  approved: "Approved to serve",
  supervised: "Supervised practice",
  override: "Override",
};

/** How a candidate shows in the "who to assign" list. */
export function candidateLabel(candidate: {
  name: string;
  approved: boolean;
  conflict: boolean;
  unavailable: boolean;
}): string {
  const notes = [
    candidate.approved ? "approved" : "not approved for this role",
    candidate.conflict ? "already serving then" : null,
    candidate.unavailable ? "unavailable that day" : null,
  ].filter(Boolean);
  return `${candidate.name} (${notes.join(", ")})`;
}

// ---------------------------------------------------------------------------
// Errors from the database
// ---------------------------------------------------------------------------

export type ScheduleError =
  | "not_authorized"
  | "event_closed"
  | "volunteer_not_member"
  | "position_filled"
  | "schedule_conflict"
  | "volunteer_unavailable"
  | "supervisor_not_approved"
  | "not_approved_for_role"
  | "position_has_history"
  | "assignment_closed"
  | "invalid_dates"
  | "unknown";

const KNOWN: ReadonlySet<string> = new Set<ScheduleError>([
  "not_authorized",
  "event_closed",
  "volunteer_not_member",
  "position_filled",
  "schedule_conflict",
  "volunteer_unavailable",
  "supervisor_not_approved",
  "not_approved_for_role",
  "position_has_history",
  "assignment_closed",
  "invalid_dates",
]);

export function toScheduleError(
  error: { code?: string | null; message?: string | null } | null | undefined,
): ScheduleError {
  if (error?.message && KNOWN.has(error.message)) {
    return error.message as ScheduleError;
  }
  return error?.code === "42501" ? "not_authorized" : "unknown";
}

export function scheduleErrorMessage(error: ScheduleError): string {
  switch (error) {
    case "not_authorized":
      return "Only people who schedule this department can do that.";
    case "event_closed":
      return "This event is over or cancelled.";
    case "volunteer_not_member":
      return "They need to be an active member of the department.";
    case "position_filled":
      return "Someone is already in this position. Cancel their assignment first.";
    case "schedule_conflict":
      return "They're already serving at that time. Choose someone else, or override with a reason if you're allowed to.";
    case "volunteer_unavailable":
      return "They've said they're unavailable that day. Choose someone else, or override with a reason if you're allowed to.";
    case "supervisor_not_approved":
      return "The supervisor must be someone else who is Approved to Serve in this role.";
    case "not_approved_for_role":
      return "They aren't Approved to Serve in this role yet. Name a supervisor for supervised practice, or override with a reason if you're allowed to.";
    case "position_has_history":
      return "This position has assignment history, so it stays. Cancel the assignment instead.";
    case "assignment_closed":
      return "This assignment can't be changed any more.";
    case "invalid_dates":
      return "Check the dates.";
    case "unknown":
      return "That didn't save. Check your connection and try again.";
  }
}
