/**
 * Lesson and course progress (SRS-PROG-001..007). Pure rules over the learner's progress rows.
 *
 * Completion is something the learner marks; it is never inferred from watching (SRS-LESSON-006).
 * A completed course is not a competency and not Approved to Serve: those are separate records
 * decided by assessments (SPEC §3, SRS-PROG-007). Required quizzes must be passed as well.
 *
 * Revised courses (SRS-PROG-008): rows are kept per lesson version, and progress carries over to a
 * newer version by the lesson's stable key. This is the "keep" policy; "review" and "retrain" are
 * not offered yet.
 */
import {
  courseSteps,
  flattenLessons,
  type CourseQuiz,
  type OutlineModule,
} from "@/lib/domain/learning";

export type ProgressRow = {
  lessonKey: string;
  status: "in_progress" | "completed";
  positionSeconds: number;
  lastViewedAt: string;
  completedAt: string | null;
};

export type LessonState = "not_started" | "in_progress" | "completed";

export type LessonProgress = {
  state: LessonState;
  /** Where the video was last paused, for resuming. Informal only. */
  positionSeconds: number;
  completedAt: string | null;
};

const NOT_STARTED: LessonProgress = { state: "not_started", positionSeconds: 0, completedAt: null };

/** One entry per lesson key: completed if any version was completed, else the latest view. */
export function lessonProgressByKey(rows: readonly ProgressRow[]): Map<string, LessonProgress> {
  const byKey = new Map<string, LessonProgress & { lastViewedAt: string }>();
  for (const row of rows) {
    const existing = byKey.get(row.lessonKey);
    const newer = !existing || row.lastViewedAt > existing.lastViewedAt;
    const completedAt = earliest(existing?.completedAt ?? null, row.completedAt);
    byKey.set(row.lessonKey, {
      state: completedAt ? "completed" : "in_progress",
      completedAt,
      positionSeconds: newer ? row.positionSeconds : (existing?.positionSeconds ?? 0),
      lastViewedAt: newer ? row.lastViewedAt : (existing?.lastViewedAt ?? row.lastViewedAt),
    });
  }
  return new Map(
    [...byKey].map(([key, { state, positionSeconds, completedAt }]) => [
      key,
      { state, positionSeconds, completedAt },
    ]),
  );
}

function earliest(a: string | null, b: string | null): string | null {
  if (a === null) return b;
  if (b === null) return a;
  return a < b ? a : b;
}

export function progressFor(
  progress: ReadonlyMap<string, LessonProgress>,
  lessonKey: string,
): LessonProgress {
  return progress.get(lessonKey) ?? NOT_STARTED;
}

export type CourseState = "not_started" | "in_progress" | "completed";

export type CourseProgress = {
  state: CourseState;
  /** Lessons that count towards completion: the required ones, or all if none are required. */
  countedTotal: number;
  countedCompleted: number;
  /** Required quizzes, and how many of them are passed. */
  quizzesTotal: number;
  quizzesPassed: number;
  /** 0–100, whole numbers, from counted lessons and required quizzes only. */
  percent: number;
  /** The first lesson or quiz in teaching order that isn't done; null when all are. */
  next: { kind: "lesson" | "quiz"; key: string; title: string; started: boolean } | null;
};

/**
 * Course progress derived from its live outline, its quizzes, and the learner's lesson progress and
 * quiz passes (SRS-PROG-002). A pass on any version of a quiz counts (the "keep" policy).
 */
export function courseProgress(
  modules: readonly OutlineModule[],
  progress: ReadonlyMap<string, LessonProgress>,
  quizzes: readonly CourseQuiz[] = [],
  passedQuizKeys: ReadonlySet<string> = new Set(),
): CourseProgress {
  const lessons = flattenLessons(modules);
  const required = lessons.filter((lesson) => lesson.isRequired);
  const counted = required.length > 0 ? required : lessons;
  const countedCompleted = counted.filter(
    (lesson) => progressFor(progress, lesson.key).state === "completed",
  ).length;
  const requiredQuizzes = quizzes.filter((quiz) => quiz.isRequired);
  const quizzesPassed = requiredQuizzes.filter((quiz) => passedQuizKeys.has(quiz.key)).length;
  const touched =
    lessons.some((lesson) => progressFor(progress, lesson.key).state !== "not_started") ||
    quizzes.some((quiz) => passedQuizKeys.has(quiz.key));
  const nextStep = courseSteps(modules, quizzes).find((step) =>
    step.kind === "quiz"
      ? !passedQuizKeys.has(step.key)
      : progressFor(progress, step.key).state !== "completed",
  );
  const completed =
    counted.length > 0 &&
    countedCompleted === counted.length &&
    quizzesPassed === requiredQuizzes.length;
  const total = counted.length + requiredQuizzes.length;

  return {
    state: completed ? "completed" : touched ? "in_progress" : "not_started",
    countedTotal: counted.length,
    countedCompleted,
    quizzesTotal: requiredQuizzes.length,
    quizzesPassed,
    percent: total === 0 ? 0 : Math.floor(((countedCompleted + quizzesPassed) / total) * 100),
    next: nextStep
      ? {
          kind: nextStep.kind,
          key: nextStep.key,
          title: nextStep.title,
          started:
            nextStep.kind === "lesson" &&
            progressFor(progress, nextStep.key).state === "in_progress",
        }
      : null,
  };
}

export const COURSE_STATE_LABELS: Record<CourseState, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  completed: "Completed",
};

/** "3 of 8 required lessons done", "All lessons done", plus " · quiz passed" when there are quizzes. */
export function courseProgressLabel(course: CourseProgress, hasRequired: boolean): string {
  const noun = hasRequired ? "required lessons" : "lessons";
  let lessons: string;
  if (course.countedTotal > 0 && course.countedCompleted === course.countedTotal) {
    lessons = `All ${noun} done`;
  } else if (course.countedTotal === 1) {
    lessons = `0 of 1 ${noun.slice(0, -1)} done`;
  } else {
    lessons = `${course.countedCompleted} of ${course.countedTotal} ${noun} done`;
  }
  if (course.quizzesTotal === 0) {
    return lessons;
  }
  const quizzes =
    course.quizzesTotal === 1
      ? course.quizzesPassed === 1
        ? "quiz passed"
        : "quiz not passed yet"
      : `${course.quizzesPassed} of ${course.quizzesTotal} quizzes passed`;
  return `${lessons} · ${quizzes}`;
}

/**
 * Courses for "Continue learning" (DESIGN §6.1): the most recently opened, in departments the
 * person still belongs to. Activity is expected newest first.
 */
export function recentCourseIds(
  activity: ReadonlyMap<string, { departmentId: string; lastViewedAt: string }>,
  memberDepartmentIds: readonly string[],
  limit: number,
): string[] {
  const member = new Set(memberDepartmentIds);
  return [...activity]
    .filter(([, entry]) => member.has(entry.departmentId))
    .toSorted(([, a], [, b]) => (a.lastViewedAt < b.lastViewedAt ? 1 : -1))
    .slice(0, limit)
    .map(([courseId]) => courseId);
}
