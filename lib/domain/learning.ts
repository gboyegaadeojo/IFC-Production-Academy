/**
 * Learner-facing course structure (DESIGN §6.3–6.5, SRS-CUR-002, SRS-MEM-005). Pure helpers over
 * published content. Nothing here records or implies progress, completion, competency, or approval
 * to serve: those are separate records that don't exist yet (SPEC §3).
 */

export type OutlineLesson = {
  /** Stable across versions, so links survive a republish (SRS-CUR-008). */
  key: string;
  title: string;
  isRequired: boolean;
  estimatedMinutes: number | null;
  sortOrder: number;
};

export type OutlineModule = {
  id: string;
  title: string;
  summary: string;
  sortOrder: number;
  lessons: OutlineLesson[];
};

/** Modules and their lessons in teaching order. */
export function orderedOutline(modules: readonly OutlineModule[]): OutlineModule[] {
  return modules
    .toSorted((a, b) => a.sortOrder - b.sortOrder)
    .map((module) => ({
      ...module,
      lessons: module.lessons.toSorted((a, b) => a.sortOrder - b.sortOrder),
    }));
}

/** Every lesson in teaching order, with its module. */
export function flattenLessons(
  modules: readonly OutlineModule[],
): (OutlineLesson & { moduleId: string; moduleTitle: string })[] {
  return orderedOutline(modules).flatMap((module) =>
    module.lessons.map((lesson) => ({ ...lesson, moduleId: module.id, moduleTitle: module.title })),
  );
}

export type LessonPosition = {
  index: number;
  total: number;
  previous: { key: string; title: string } | null;
  next: { key: string; title: string } | null;
};

/** Where a lesson sits in the course, for previous/next navigation. Null if it isn't there. */
export function lessonPosition(
  modules: readonly OutlineModule[],
  lessonKey: string,
): LessonPosition | null {
  const lessons = flattenLessons(modules);
  const index = lessons.findIndex((lesson) => lesson.key === lessonKey);
  if (index < 0) {
    return null;
  }
  const previous = lessons[index - 1];
  const next = lessons[index + 1];
  return {
    index,
    total: lessons.length,
    previous: previous ? { key: previous.key, title: previous.title } : null,
    next: next ? { key: next.key, title: next.title } : null,
  };
}

export type CourseTotals = {
  lessons: number;
  required: number;
  optional: number;
  /** Sum of lesson estimates, only when every lesson has one; never a guess. */
  estimatedMinutes: number | null;
};

export function courseTotals(modules: readonly OutlineModule[]): CourseTotals {
  const lessons = flattenLessons(modules);
  const required = lessons.filter((lesson) => lesson.isRequired).length;
  const allEstimated =
    lessons.length > 0 && lessons.every((lesson) => lesson.estimatedMinutes !== null);
  return {
    lessons: lessons.length,
    required,
    optional: lessons.length - required,
    estimatedMinutes: allEstimated
      ? lessons.reduce((total, lesson) => total + (lesson.estimatedMinutes ?? 0), 0)
      : null,
  };
}

/** "45 min" or "1 h 30 min". */
export function formatMinutes(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/** Lesson text is plain text; blank lines separate paragraphs. */
export function paragraphs(body: string): string[] {
  return body
    .split(/\r?\n\s*\r?\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);
}

export function lessonCountLabel(count: number): string {
  return count === 1 ? "1 lesson" : `${count} lessons`;
}

/** A quiz in the live course, placed after a module or (afterModuleId null) at the end. */
export type CourseQuiz = {
  /** Stable across versions, like a lesson key. */
  key: string;
  title: string;
  isRequired: boolean;
  afterModuleId: string | null;
};

/** A practical assessment in the live course, placed like a quiz. */
export type CoursePractical = CourseQuiz;

export type StepKind = "lesson" | "quiz" | "practical";

export type CourseStep = { kind: StepKind; key: string; title: string; isRequired: boolean };

/**
 * Lessons, quizzes, and practicals in teaching order: each module's lessons, then the quizzes and
 * practicals placed after it; those for the end of the course (or a module that isn't there any
 * more) come last.
 */
export function courseSteps(
  modules: readonly OutlineModule[],
  quizzes: readonly CourseQuiz[],
  practicals: readonly CoursePractical[] = [],
): CourseStep[] {
  const ordered = orderedOutline(modules);
  const moduleIds = new Set(ordered.map((module) => module.id));
  const checks = [
    ...quizzes.map((quiz) => ({ ...quiz, kind: "quiz" as const })),
    ...practicals.map((practical) => ({ ...practical, kind: "practical" as const })),
  ];
  const step = (check: (typeof checks)[number]): CourseStep => ({
    kind: check.kind,
    key: check.key,
    title: check.title,
    isRequired: check.isRequired,
  });
  return [
    ...ordered.flatMap((module) => [
      ...module.lessons.map((lesson): CourseStep => ({
        kind: "lesson",
        key: lesson.key,
        title: lesson.title,
        isRequired: lesson.isRequired,
      })),
      ...checks.filter((check) => check.afterModuleId === module.id).map(step),
    ]),
    ...checks
      .filter((check) => check.afterModuleId === null || !moduleIds.has(check.afterModuleId))
      .map(step),
  ];
}

/** Where a step lives in the app. */
export function stepHref(courseId: string, step: { kind: StepKind; key: string }): string {
  switch (step.kind) {
    case "quiz":
      return `/courses/${courseId}/quizzes/${step.key}`;
    case "practical":
      return `/courses/${courseId}/practicals/${step.key}`;
    case "lesson":
      return `/courses/${courseId}/lessons/${step.key}`;
  }
}
