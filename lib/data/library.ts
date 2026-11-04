import "server-only";
import { cache } from "react";
import type { DepartmentCard } from "@/lib/data/departments";
import { getLearnerCourses, type LearnerCourse } from "@/lib/data/pathway";
import { getCourseProgressById, getLearnerActivity } from "@/lib/data/progress";
import { createSupabaseServerClient } from "@/lib/data/supabase/server";
import { publicEnv } from "@/lib/env";
import { courseSteps, stepHref } from "@/lib/domain/learning";
import { courseCoverUrl, sortLibrary, type LibraryCourse } from "@/lib/domain/library";
import type { CourseProgress, CourseState } from "@/lib/domain/progress";

/** Opening a course goes straight to what's next (Course Hierarchy mock, approved 2026-11-04). */
function openHref(course: LearnerCourse, progress: CourseProgress | undefined): string {
  if (progress?.state === "completed") {
    return `/courses/${course.id}`;
  }
  const step = progress?.next ?? courseSteps(course.modules, course.quizzes, course.practicals)[0];
  return course.canOpen && step ? stepHref(course.id, step) : `/courses/${course.id}`;
}

/**
 * Every published course in the categories this person can browse, with their own progress
 * (SRS-CUR-017). It reads them all at once, so the number of calls doesn't grow with the courses.
 */
export async function getCourseLibrary(
  userId: string,
  categories: readonly DepartmentCard[],
): Promise<LibraryCourse[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("courses")
    .select("id, department_id, sort_order, cover_image_path")
    .in(
      "department_id",
      categories.map((category) => category.id),
    )
    .is("archived_at", null);
  if (error) {
    throw new Error("Could not load the courses", { cause: error.code });
  }
  const ids = data.map((row) => row.id);
  const learner = await getLearnerCourses(ids);
  // Most courses are untouched, so only work out progress for the ones this person has opened.
  const activity = await getLearnerActivity(userId, ids);
  const progress = await getCourseProgressById(userId, [...activity.keys()], learner);
  const { NEXT_PUBLIC_SUPABASE_URL: url } = publicEnv();

  return sortLibrary(
    data.flatMap((row) => {
      const course = learner.get(row.id);
      const category = categories.find((c) => c.id === row.department_id);
      if (!course || !category) {
        return [];
      }
      const courseProgress = progress.get(row.id);
      const lessons = course.modules.reduce((n, m) => n + m.lessons.length, 0);
      return [
        {
          id: course.id,
          title: course.title,
          href: openHref(course, courseProgress),
          category: {
            id: category.id,
            slug: category.slug,
            name: category.name,
            kind: category.kind,
            hue: category.hue,
            icon: category.icon,
            sortOrder: category.sortOrder,
          },
          level: category.usesLevels ? course.level.number : null,
          sortOrder: row.sort_order,
          lessonCount: course.canOpen ? lessons : null,
          estimatedMinutes: course.estimatedMinutes,
          coverUrl: row.cover_image_path ? courseCoverUrl(url, row.cover_image_path) : null,
          percent: courseProgress?.percent ?? 0,
          state: courseProgress?.state ?? "not_started",
        } satisfies LibraryCourse,
      ];
    }),
  );
}

export type StartHereCourse = {
  id: string;
  title: string;
  href: string;
  state: CourseState;
  estimatedMinutes: number | null;
};

/**
 * The courses marked Start here, with this person's progress (SRS-CUR-018). Training and the
 * department page both show them, and they're never a gate.
 */
export const getStartHereCourses = cache(async (userId: string): Promise<StartHereCourse[]> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("courses")
    .select("id")
    .eq("start_here", true)
    .is("archived_at", null)
    .order("sort_order");
  if (error) {
    throw new Error("Could not load the courses", { cause: error.code });
  }
  const ids = data.map((row) => row.id);
  const learner = await getLearnerCourses(ids);
  const progress = await getCourseProgressById(userId, ids, learner);
  return ids.flatMap((id) => {
    const course = learner.get(id);
    if (!course) {
      return [];
    }
    const courseProgress = progress.get(id);
    return [
      {
        id,
        title: course.title,
        href: openHref(course, courseProgress),
        state: courseProgress?.state ?? "not_started",
        estimatedMinutes: course.estimatedMinutes,
      },
    ];
  });
});
