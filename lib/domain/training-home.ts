/**
 * Pieces of Training in mock 5 (G, 2026-11-06): the greeting, the "You're serving" card, and
 * Recently watched. Watch time is an informal hint and never proof of viewing; a lesson is
 * "Completed" only when the learner marks it so (SRS-LESSON-006).
 */
import { formatMinutes } from "./learning";
import { READINESS_LABELS, type AssignmentReadiness } from "./schedule";

const TIME_ZONE = "America/Winnipeg";
const HOUR = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  hour: "numeric",
  hourCycle: "h23",
});
const DAY = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, weekday: "long" });
const DATE = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, dateStyle: "short" });
const SHORT_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  weekday: "short",
  month: "short",
  day: "numeric",
});
const MONTH_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  month: "short",
  day: "numeric",
});
const TIME = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  hour: "numeric",
  minute: "2-digit",
});
const DAY_MS = 24 * 60 * 60 * 1000;

/** "Good morning" until noon, "Good afternoon" until 5 pm, then "Good evening", in Winnipeg. */
export function timeOfDayGreeting(now: Date): string {
  const hour = Number(HOUR.format(now));
  if (hour >= 5 && hour < 12) {
    return "Good morning";
  }
  if (hour >= 12 && hour < 17) {
    return "Good afternoon";
  }
  return "Good evening";
}

export type ServingInput = {
  id: string;
  status: string;
  readiness: AssignmentReadiness;
  startsAt: string;
  endsAt: string;
  roleName: string;
  eventTitle: string;
};

export type ServingSpotlight = {
  id: string;
  /** "You're serving today", "You're serving Sunday", or a date further out. */
  eyebrow: string;
  title: string;
  detail: string;
  /** Waiting for a reply, so the card asks for one first. */
  needsReply: boolean;
};

function dayWords(startsAt: string, now: Date): string {
  const start = new Date(startsAt);
  if (DATE.format(start) === DATE.format(now)) {
    return "today";
  }
  if (DATE.format(start) === DATE.format(new Date(now.getTime() + DAY_MS))) {
    return "tomorrow";
  }
  return start.getTime() - now.getTime() < 6 * DAY_MS
    ? DAY.format(start)
    : `on ${SHORT_DATE.format(start)}`;
}

/** The next service you're on and haven't declined, for the card at the top of Training. */
export function servingSpotlight(
  servings: readonly ServingInput[],
  now: Date,
): ServingSpotlight | null {
  const next = servings
    .filter((s) => s.status !== "declined" && s.status !== "cancelled")
    .filter((s) => new Date(s.endsAt).getTime() > now.getTime())
    .toSorted((a, b) => (a.startsAt < b.startsAt ? -1 : 1))[0];
  if (!next) {
    return null;
  }
  const needsReply = next.status === "pending";
  return {
    id: next.id,
    eyebrow: `You're serving ${dayWords(next.startsAt, now)}`,
    title: `${next.roleName} · ${TIME.format(new Date(next.startsAt))}`,
    detail: [next.eventTitle, needsReply ? "Please reply" : READINESS_LABELS[next.readiness]]
      .filter(Boolean)
      .join(" · "),
    needsReply,
  };
}

export type WatchedRow = {
  courseId: string;
  lessonKey: string;
  status: "in_progress" | "completed";
  positionSeconds: number;
  lastViewedAt: string;
  completedAt: string | null;
};

export type WatchedLesson = {
  title: string;
  courseTitle: string;
  href: string;
  minutes: number | null;
  thumbnailUrl: string | null;
};

export type RecentLesson = WatchedLesson & {
  key: string;
  completed: boolean;
  /** How far into the video, 0 to 100, as a hint. Null when the length isn't known. */
  percent: number | null;
  status: string;
};

function watchedStatus(row: WatchedRow, minutes: number | null): string {
  if (row.completedAt) {
    return `Completed ${MONTH_DAY.format(new Date(row.completedAt))}`;
  }
  const watched = Math.round(row.positionSeconds / 60);
  if (watched < 1) {
    return "Opened";
  }
  return minutes
    ? `About ${formatMinutes(Math.min(watched, minutes))} of ${formatMinutes(minutes)} watched`
    : `About ${formatMinutes(watched)} watched`;
}

/**
 * The lessons opened most recently, newest first, one entry per lesson however many versions were
 * studied. A lesson is completed if any version was. Lessons that can't be opened are left out.
 */
export function recentlyWatched(
  rows: readonly WatchedRow[],
  lessons: ReadonlyMap<string, WatchedLesson>,
  limit = 4,
): RecentLesson[] {
  const seen = new Map<string, WatchedRow>();
  for (const row of rows.toSorted((a, b) => (a.lastViewedAt < b.lastViewedAt ? 1 : -1))) {
    const key = `${row.courseId}:${row.lessonKey}`;
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, row);
    } else if (!existing.completedAt && row.completedAt) {
      seen.set(key, { ...existing, completedAt: row.completedAt, status: "completed" });
    }
  }
  return [...seen]
    .flatMap(([key, row]) => {
      const lesson = lessons.get(key);
      if (!lesson) {
        return [];
      }
      const completed = row.completedAt !== null;
      const percent =
        completed || !lesson.minutes
          ? null
          : Math.min(99, Math.round((row.positionSeconds / (lesson.minutes * 60)) * 100));
      return [{ ...lesson, key, completed, percent, status: watchedStatus(row, lesson.minutes) }];
    })
    .slice(0, limit);
}
