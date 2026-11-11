/**
 * Scheduling (SRS-SCHED-001..011, SRS-COMP-005..008). Pure helpers: Winnipeg wall-clock times for
 * forms, labels, and validation. The database runs every competency, conflict, and availability
 * check when someone is assigned.
 */
import { z } from "zod";
import { TIME_ZONE } from "./time-zone";

export { TIME_ZONE };

/** The UTC offset in minutes of Winnipeg at an instant (−300 all year since 2026-11-01). */
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

/** "Sun, Nov 8" in Winnipeg time, for a service day with no times yet. */
export function eventDayLabel(startsAt: string): string {
  return DAY.format(new Date(startsAt));
}

const DATE_PARTS = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  weekday: "long",
  month: "long",
  day: "numeric",
});

/**
 * A service's day for a calendar tile (Serve option A, G 2026-11-10), in Winnipeg time:
 * { month: "NOV", monthName: "November", day: "15", weekday: "Sunday", time: "10:05 a.m. – 12:00 p.m." }.
 * No time when the service's times aren't set yet.
 */
export function eventDateParts(
  startsAt: string,
  endsAt: string | null,
): { month: string; monthName: string; day: string; weekday: string; time: string | null } {
  const start = new Date(startsAt);
  const parts = DATE_PARTS.formatToParts(start);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const monthName = get("month");
  return {
    month: monthName.slice(0, 3).toUpperCase(),
    monthName,
    day: get("day"),
    weekday: get("weekday"),
    time: endsAt ? `${TIME.format(start)} – ${TIME.format(new Date(endsAt))}` : null,
  };
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

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

export type AssignmentStatus = "pending" | "confirmed" | "declined" | "cancelled";
/**
 * What the scheduler saw about training when they scheduled someone. Training is shown, never
 * enforced (decided 2026-10-31): "learning" is anyone not yet Approved to Serve in the role, and
 * "override" is kept only for assignments made before that decision.
 */
export type AssignmentReadiness = "approved" | "supervised" | "learning" | "override";

export const ASSIGNMENT_STATUS_LABELS: Record<AssignmentStatus, string> = {
  pending: "Waiting for a reply",
  confirmed: "Confirmed",
  declined: "Declined",
  cancelled: "Cancelled",
};

export const READINESS_LABELS: Record<AssignmentReadiness, string> = {
  approved: "Trained",
  supervised: "Learning, with someone alongside",
  learning: "Still learning",
  override: "Override",
};

/** How a candidate shows in the "who to schedule" list. */
export function candidateLabel(candidate: {
  name: string;
  approved: boolean;
  conflict: boolean;
  unavailable: boolean;
}): string {
  const notes = [
    candidate.approved ? "trained" : "still learning",
    candidate.conflict ? "already serving that day" : null,
    candidate.unavailable ? "blocked out that day" : null,
  ].filter(Boolean);
  return `${candidate.name} (${notes.join(", ")})`;
}

// ---------------------------------------------------------------------------
// Positions with several places
// ---------------------------------------------------------------------------

type Place = {
  roleId: string;
  roleName: string;
  departmentName: string;
  assignment: { status: AssignmentStatus } | null;
};

export type PositionGroup<T extends Place> = {
  roleId: string;
  roleName: string;
  departmentName: string;
  places: T[];
  /** Places held by someone who hasn't declined. */
  filled: number;
};

/**
 * A service's places grouped by position, in the order they first appear: "Camera 2, 1 of 2
 * filled". Each place holds one person.
 */
export function groupPlaces<T extends Place>(places: readonly T[]): PositionGroup<T>[] {
  const groups = new Map<string, PositionGroup<T>>();
  for (const place of places) {
    const group = groups.get(place.roleId) ?? {
      roleId: place.roleId,
      roleName: place.roleName,
      departmentName: place.departmentName,
      places: [],
      filled: 0,
    };
    group.places.push(place);
    if (place.assignment?.status === "pending" || place.assignment?.status === "confirmed") {
      group.filled += 1;
    }
    groups.set(place.roleId, group);
  }
  return [...groups.values()];
}

/** "Not sent yet" until the scheduler sends the request, then the reply. */
export function assignmentStatusLabel(assignment: {
  status: AssignmentStatus;
  requestSent: boolean;
}): string {
  return assignment.status === "pending" && !assignment.requestSent
    ? "Not sent yet"
    : ASSIGNMENT_STATUS_LABELS[assignment.status];
}

/** How many days before a service its reminder goes out: 1 to 7. */
export const reminderDaysSchema = z.coerce
  .number()
  .int()
  .min(1, "Choose 1 to 7 days.")
  .max(7, "Choose 1 to 7 days.");

export const REMINDER_DAY_CHOICES = [1, 2, 3, 4, 5, 6, 7] as const;

export function reminderDaysLabel(days: number): string {
  return days === 1 ? "1 day before" : `${days} days before`;
}

/** The Winnipeg day a service's reminder goes out, at 10:00: "Fri, Nov 13". */
export function reminderDayLabel(startsAt: string, days: number): string {
  const [date] = utcToWinnipeg(startsAt);
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, day - days, 12)));
}

export const sendRequestsSchema = z.object({
  eventId: z.uuid(),
  assignmentIds: z.array(z.uuid()).min(1, "Tick at least one person."),
  message: z.string().trim().max(500, "Keep the message under 500 characters."),
});

// ---------------------------------------------------------------------------
// Errors from the database
// ---------------------------------------------------------------------------

export type ScheduleError =
  | "not_authorized"
  | "event_closed"
  | "volunteer_not_member"
  | "not_on_team"
  | "position_filled"
  | "schedule_conflict"
  | "volunteer_unavailable"
  | "supervisor_not_approved"
  | "position_has_history"
  | "assignment_closed"
  | "invalid_dates"
  | "signups_closed"
  | "request_closed"
  | "invalid_note"
  | "managed_in_planning_center"
  | "unknown";

const KNOWN: ReadonlySet<string> = new Set<ScheduleError>([
  "not_authorized",
  "event_closed",
  "volunteer_not_member",
  "not_on_team",
  "position_filled",
  "schedule_conflict",
  "volunteer_unavailable",
  "supervisor_not_approved",
  "position_has_history",
  "assignment_closed",
  "invalid_dates",
  "signups_closed",
  "request_closed",
  "invalid_note",
  "managed_in_planning_center",
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
    case "not_on_team":
      return "Only people on this department's serving team can be scheduled. Ask whoever runs the teams to add them.";
    case "position_filled":
      return "Someone is already in this position. Cancel their assignment first.";
    case "schedule_conflict":
      return "They're already serving then, or in another department that day. Choose someone else, or override with a reason if you're allowed to.";
    case "volunteer_unavailable":
      return "They've said they're unavailable that day. Choose someone else, or override with a reason if you're allowed to.";
    case "supervisor_not_approved":
      return "The person alongside them must be someone else who is trained for this role.";
    case "position_has_history":
      return "This position has assignment history, so it stays. Cancel the assignment instead.";
    case "assignment_closed":
      return "This assignment can't be changed any more.";
    case "invalid_dates":
      return "Check the dates.";
    case "signups_closed":
      return "Sign-ups for this service are closed.";
    case "request_closed":
      return "Someone has already covered this, or it was withdrawn.";
    case "invalid_note":
      return "Keep the note under 300 characters.";
    case "managed_in_planning_center":
      return "Planning Center schedules right now, so make this change there. It shows here within 15 minutes.";
    case "unknown":
      return "That didn't save. Check your connection and try again.";
  }
}

/** "just now", "2 minutes ago", "3 hours ago", "2 days ago": for "Last synced". */
/** A Planning Center sync with no success for this long is late (runs are every 15 minutes). */
export const SYNC_LATE_MINUTES = 60;

/**
 * Whether admins should be warned that Planning Center hasn't synced (health check follow-up,
 * G 2026-11-11). Never synced counts as late.
 */
export function syncIsLate(lastSynced: string | null, now: Date = new Date()): boolean {
  return lastSynced === null || now.getTime() - Date.parse(lastSynced) > SYNC_LATE_MINUTES * 60_000;
}

const SYNC_TIME = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  hour: "numeric",
  minute: "2-digit",
});
const SYNC_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  weekday: "short",
  month: "short",
  day: "numeric",
});

/** "3:45 p.m." today, or "Mon, Nov 9 at 3:45 p.m." on another day, in Winnipeg time. */
export function syncedAtLabel(iso: string, now: Date = new Date()): string {
  const at = new Date(iso);
  const time = SYNC_TIME.format(at);
  return SYNC_DAY.format(at) === SYNC_DAY.format(now) ? time : `${SYNC_DAY.format(at)} at ${time}`;
}

export function syncedAgo(iso: string, now: Date = new Date()): string {
  const minutes = Math.max(0, Math.floor((now.getTime() - Date.parse(iso)) / 60_000));
  if (minutes < 1) {
    return "just now";
  }
  if (minutes < 60) {
    return `${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  }
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? "day" : "days"} ago`;
}

/** How the Schedule page names an assignment's state (redesign approved 2026-11-01). */
export const SERVING_LABELS = {
  confirmed: "Serving",
  pending: "Asked to serve",
  declined: "Declined",
} as const;
