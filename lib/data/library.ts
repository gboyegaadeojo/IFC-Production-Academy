import "server-only";
import type { DepartmentCard } from "@/lib/data/departments";
import { getLearnerCourses } from "@/lib/data/pathway";
import { getCourseProgressById } from "@/lib/data/progress";
import { createSupabaseServerClient } from "@/lib/data/supabase/server";
import { publicEnv } from "@/lib/env";
import { courseCoverUrl, sortLibrary, type LibraryCourse } from "@/lib/domain/library";

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
  const progress = await getCourseProgressById(userId, ids, learner);
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
