/**
 * Learner home (DESIGN §6.1). Pure rules: which state the home page is in, and a per-level summary
 * of published courses. Built only from real records; nothing here invents progress.
 */
import type { DepartmentCardState } from "./departments";

export type HomeState = "new" | "pending" | "member";

/**
 * - member: belongs to at least one department (enrolled, with or without courses)
 * - pending: no memberships yet, but at least one request is waiting
 * - new: neither
 */
export function homeState(cards: readonly { state: DepartmentCardState }[]): HomeState {
  if (cards.some((card) => card.state.kind === "member")) {
    return "member";
  }
  if (cards.some((card) => card.state.kind === "requested")) {
    return "pending";
  }
  return "new";
}

export type LevelSummary = {
  levelId: string;
  number: number;
  name: string;
  publishedCourses: number;
  /** Lessons that count towards completion in this level's published courses, and how many are done. */
  lessonsTotal: number;
  lessonsDone: number;
};

export type DepartmentLearning = {
  departmentId: string;
  levels: LevelSummary[];
  publishedCourses: number;
};

/** A published course's live lessons, with the keys the learner has marked complete. */
export type PublishedCourseLessons = {
  levelId: string;
  lessons?: readonly { key: string; isRequired: boolean }[];
  completedKeys?: ReadonlySet<string>;
};

/**
 * The lessons that count towards a course, using the same rule as course progress: the required
 * ones, or all of them when none are required. Done means the learner marked it complete.
 */
export function countedLessons(
  lessons: readonly { key: string; isRequired: boolean }[],
  completedKeys: ReadonlySet<string>,
): { total: number; done: number } {
  const required = lessons.filter((lesson) => lesson.isRequired);
  const counted = required.length > 0 ? required : lessons;
  return {
    total: counted.length,
    done: counted.filter((lesson) => completedKeys.has(lesson.key)).length,
  };
}

/**
 * Counts published, non-archived courses per level for each department, and the learner's lessons
 * marked complete in them. Membership never implies progress, completion, or approval to serve.
 */
export function summariseLearning(
  departmentIds: readonly string[],
  levels: readonly { id: string; departmentId: string; number: number; name: string }[],
  publishedCourses: readonly PublishedCourseLessons[],
): DepartmentLearning[] {
  return departmentIds.map((departmentId) => {
    const departmentLevels = levels
      .filter((level) => level.departmentId === departmentId)
      .toSorted((a, b) => a.number - b.number)
      .map((level) => {
        const courses = publishedCourses.filter((course) => course.levelId === level.id);
        const counts = courses.map((course) =>
          countedLessons(course.lessons ?? [], course.completedKeys ?? new Set()),
        );
        return {
          levelId: level.id,
          number: level.number,
          name: level.name,
          publishedCourses: courses.length,
          lessonsTotal: counts.reduce((total, count) => total + count.total, 0),
          lessonsDone: counts.reduce((total, count) => total + count.done, 0),
        };
      });
    return {
      departmentId,
      levels: departmentLevels,
      publishedCourses: departmentLevels.reduce(
        (total, level) => total + level.publishedCourses,
        0,
      ),
    };
  });
}

export function courseCountLabel(count: number): string {
  return count === 1 ? "1 course" : `${count} courses`;
}

/** "4 of 12 lessons", "No courses yet", or the course count when lessons aren't readable. */
export function levelProgressLabel(level: LevelSummary): string {
  if (level.publishedCourses === 0) {
    return "No courses yet";
  }
  if (level.lessonsTotal === 0) {
    return courseCountLabel(level.publishedCourses);
  }
  return `${level.lessonsDone} of ${level.lessonsTotal} ${level.lessonsTotal === 1 ? "lesson" : "lessons"}`;
}
