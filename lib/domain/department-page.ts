import type { CourseProgress } from "./progress";

/**
 * The department page, option D (approved 2026-11-07): A's cover and next step with B's path and
 * what each role still needs. Pure rules, so the page stays a thin layer over them.
 */

type Course = { id: string; lessonCount: number | null };
type Level = { courses: readonly Course[] };

export type LessonTally = { done: number; total: number; percent: number };

/** Lessons done out of lessons that count, across some courses. Never more than marked done. */
export function lessonTally(
  courses: readonly Course[],
  progress: ReadonlyMap<string, CourseProgress>,
): LessonTally {
  let done = 0;
  let total = 0;
  for (const course of courses) {
    const p = progress.get(course.id);
    done += p?.countedCompleted ?? 0;
    total += p?.countedTotal ?? course.lessonCount ?? 0;
  }
  return { done, total, percent: total > 0 ? Math.round((done / total) * 100) : 0 };
}

/**
 * The level that opens first: the one holding the course to carry on with, else the first with
 * courses, else none (-1).
 */
export function openingLevel(levels: readonly Level[], targetCourseId: string | null): number {
  const holding = targetCourseId
    ? levels.findIndex((level) => level.courses.some((course) => course.id === targetCourseId))
    : -1;
  return holding !== -1 ? holding : levels.findIndex((level) => level.courses.length > 0);
}

export type RoleStep = { label: string; done: boolean };

/**
 * What a role still needs, as a short checklist (G, 2026-11-07): being a member, then each
 * practical skill the role needs. Courses never appear: finishing them doesn't approve anyone.
 */
export function roleSteps(
  role: {
    required: readonly { id: string; name: string }[];
    readiness: { missing: readonly string[]; unconfigured: boolean };
  },
  departmentName: string,
  isMember: boolean,
): RoleStep[] {
  const steps: RoleStep[] = [
    {
      label: isMember ? `Member of ${departmentName}` : `Join ${departmentName}`,
      done: isMember,
    },
  ];
  if (role.readiness.unconfigured) {
    steps.push({ label: "Hands-on check: not set up yet", done: false });
    return steps;
  }
  for (const competency of role.required) {
    const missing = role.readiness.missing.includes(competency.name);
    steps.push({
      label: missing ? `Needs ${competency.name}` : `${competency.name} passed`,
      done: !missing,
    });
  }
  return steps;
}
