/**
 * The plan at the top of Training (Home Page mock, Design D, approved 2026-11-05): someone returning
 * sees what's next, this week, and when they're ready; someone new sees getting started. These are
 * suggestions built from real records, never gates.
 */
import { formatMinutes } from "./learning";
import { eventTimeLabel } from "./schedule";
import { TIME_ZONE } from "./time-zone";

const DAY = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, weekday: "long" });
const DATE = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, dateStyle: "short" });
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export type PlanCourse = {
  id: string;
  title: string;
  href: string;
  state: string;
  estimatedMinutes: number | null;
};

export type PlanContinue = {
  courseId: string;
  courseTitle: string;
  nextTitle: string;
  nextHref: string;
  /** Null when the next step is a quiz or a practical. */
  nextLesson: {
    number: number;
    total: number;
    minutes: number | null;
    thumbnailUrl: string | null;
  } | null;
  /** A required practical not passed yet, unless it's the next step. */
  practical: { title: string; href: string } | null;
};

export type PlanServing = {
  id: string;
  status: string;
  startsAt: string;
  endsAt: string;
  roleName: string;
};

export type PlanNext = {
  title: string;
  note: string;
  href: string;
  button: string;
  /** Whether it's a video or course, so it shows a picture. */
  showThumbnail: boolean;
  thumbnailUrl: string | null;
};

export type PlanItem = {
  key: string;
  mark: "A" | "S" | "P" | "C";
  title: string;
  note: string;
  href: string;
};

export type ComingUp = { next: PlanNext | null; thisWeek: PlanItem[]; whenReady: PlanItem[] };

function courseNote(course: PlanCourse, lead: string): string {
  return course.estimatedMinutes
    ? `${lead} About ${formatMinutes(course.estimatedMinutes)}.`
    : lead;
}

function courseAsNext(course: PlanCourse, lead: string): PlanNext {
  return {
    title: course.title,
    note: courseNote(course, lead),
    href: course.href,
    button: course.state === "not_started" ? "Start the course" : "Continue",
    showThumbnail: true,
    thumbnailUrl: null,
  };
}

function continueNote(item: PlanContinue): string {
  if (!item.nextLesson) {
    return item.courseTitle;
  }
  const { number, total, minutes } = item.nextLesson;
  return [item.courseTitle, `Lesson ${number} of ${total}`, minutes ? formatMinutes(minutes) : null]
    .filter(Boolean)
    .join(" · ");
}

/** "Serving today", "Serving this Sunday": a day within the coming week, in Winnipeg time. */
export function servingTitle(startsAt: string, now: Date): string {
  const start = new Date(startsAt);
  return DATE.format(start) === DATE.format(now)
    ? "Serving today"
    : `Serving this ${DAY.format(start)}`;
}

const START_HERE_NOTE = "A good place for everyone on the team to begin.";

export function comingUp({
  continuing,
  assigned,
  startHere,
  servings,
  now,
}: {
  continuing: readonly PlanContinue[];
  assigned: readonly PlanCourse[];
  startHere: readonly PlanCourse[];
  servings: readonly PlanServing[];
  now: Date;
}): ComingUp {
  const assignedIds = new Set(assigned.map((course) => course.id));
  const startHereOpen = startHere.filter(
    (course) => course.state !== "completed" && !assignedIds.has(course.id),
  );
  const current = continuing[0];
  const firstAssigned = assigned[0];
  const firstStartHere = startHereOpen[0];

  let next: PlanNext | null = null;
  let usedCourse: string | null = null;
  if (current) {
    next = {
      title: current.nextTitle,
      note: continueNote(current),
      href: current.nextHref,
      button: "Continue",
      showThumbnail: current.nextLesson !== null,
      thumbnailUrl: current.nextLesson?.thumbnailUrl ?? null,
    };
    usedCourse = current.courseId;
  } else if (firstAssigned) {
    next = courseAsNext(firstAssigned, "A leader asked you to take this. Go at your own pace.");
    usedCourse = firstAssigned.id;
  } else if (firstStartHere) {
    next = courseAsNext(firstStartHere, START_HERE_NOTE);
    usedCourse = firstStartHere.id;
  }

  const thisWeek: PlanItem[] = [
    ...assigned
      .filter((course) => course.id !== usedCourse)
      .map((course) => ({
        key: `assigned-${course.id}`,
        mark: "A" as const,
        title: course.title,
        note: "Assigned by a leader",
        href: course.href,
      })),
    ...servings
      .filter((serving) => {
        const start = new Date(serving.startsAt).getTime();
        return serving.status !== "declined" && start - now.getTime() < WEEK_MS;
      })
      .map((serving) => ({
        key: `serving-${serving.id}`,
        mark: "S" as const,
        title: servingTitle(serving.startsAt, now),
        note: [
          serving.roleName,
          eventTimeLabel(serving.startsAt, serving.endsAt),
          serving.status === "pending" ? "Please reply" : null,
        ]
          .filter(Boolean)
          .join(" · "),
        href: "/schedule",
      })),
  ];

  const whenReady: PlanItem[] = [
    ...continuing.flatMap((item) =>
      item.practical
        ? [
            {
              key: `practical-${item.courseId}`,
              mark: "P" as const,
              title: item.practical.title,
              note: "Practical with a trainer",
              href: item.practical.href,
            },
          ]
        : [],
    ),
    ...continuing.slice(1).map((item) => ({
      key: `course-${item.courseId}`,
      mark: "C" as const,
      title: item.courseTitle,
      note: `Next: ${item.nextTitle}`,
      href: item.nextHref,
    })),
    ...startHereOpen
      .filter((course) => course.id !== usedCourse)
      .map((course) => ({
        key: `start-${course.id}`,
        mark: "C" as const,
        title: course.title,
        note: START_HERE_NOTE,
        href: course.href,
      })),
  ];

  return { next, thisWeek, whenReady };
}

export type StartStep = {
  key: string;
  title: string;
  note: string;
  href: string;
  button: string;
  isCourse: boolean;
  done: boolean;
};

/** The four steps for someone new. "Get the app" can't be known on the server, so it stays open. */
export function gettingStarted({
  hasName,
  department,
  startHere,
}: {
  hasName: boolean;
  department: "none" | "requested" | "member";
  startHere: readonly PlanCourse[];
}): {
  steps: StartStep[];
  doneCount: number;
  next: StartStep | null;
  later: StartStep[];
  done: StartStep[];
} {
  const course = startHere.find((item) => item.state !== "completed");
  const steps: StartStep[] = [
    {
      key: "name",
      title: "Add your name",
      note: "So leaders know who you are",
      href: "/profile",
      button: "Add your name",
      isCourse: false,
      done: hasName,
    },
    {
      key: "course",
      title: course?.title ?? "Choose a course",
      note: course ? courseNote(course, "Everyone starts here.") : "Anything open is yours to try.",
      href: course?.href ?? "/courses",
      button: course ? "Start the course" : "See the courses",
      isCourse: true,
      done: startHere.length > 0 && !course,
    },
    {
      key: "department",
      title: "Join a department",
      note:
        department === "requested"
          ? "Request sent. Waiting for a leader."
          : "Pick the team you'd like to serve on",
      href: "#departments",
      button: "See departments",
      isCourse: false,
      done: department !== "none",
    },
    {
      key: "app",
      title: "Get the app",
      note: "Learn from your phone",
      href: "/get-the-app",
      button: "Get the app",
      isCourse: false,
      done: false,
    },
  ];
  const open = steps.filter((step) => !step.done);
  return {
    steps,
    doneCount: steps.length - open.length,
    next: open[0] ?? null,
    later: open.slice(1),
    done: steps.filter((step) => step.done),
  };
}

/** A few courses to try: not started, and not already in the plan. */
export function courseSuggestions<T extends { id: string; state: string }>(
  courses: readonly T[],
  inPlan: ReadonlySet<string>,
  count = 3,
): T[] {
  return courses
    .filter((course) => course.state === "not_started" && !inPlan.has(course.id))
    .slice(0, count);
}
