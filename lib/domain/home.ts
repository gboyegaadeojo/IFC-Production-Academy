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
};

export type DepartmentLearning = {
  departmentId: string;
  levels: LevelSummary[];
  publishedCourses: number;
};

/**
 * Counts published, non-archived courses per level for each department. Membership never implies
 * progress, completion, or approval to serve; this is a catalogue count only.
 */
export function summariseLearning(
  departmentIds: readonly string[],
  levels: readonly { id: string; departmentId: string; number: number; name: string }[],
  publishedCourses: readonly { levelId: string }[],
): DepartmentLearning[] {
  return departmentIds.map((departmentId) => {
    const departmentLevels = levels
      .filter((level) => level.departmentId === departmentId)
      .toSorted((a, b) => a.number - b.number)
      .map((level) => ({
        levelId: level.id,
        number: level.number,
        name: level.name,
        publishedCourses: publishedCourses.filter((course) => course.levelId === level.id).length,
      }));
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
