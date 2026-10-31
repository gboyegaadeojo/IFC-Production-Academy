import "server-only";
import { createSupabaseServerClient } from "@/lib/data/supabase/server";
import { summariseLearning, type DepartmentLearning } from "@/lib/domain/home";

/**
 * Published courses per level in the given departments (DESIGN §6.1, SRS-MEM-006). Read-only.
 * RLS already limits this to published, non-archived courses any active user may browse.
 */
export async function getDepartmentLearning(
  departmentIds: readonly string[],
): Promise<DepartmentLearning[]> {
  if (departmentIds.length === 0) {
    return [];
  }
  const supabase = await createSupabaseServerClient();
  const [levels, courses] = await Promise.all([
    supabase
      .from("levels")
      .select("id, department_id, number, name")
      .in("department_id", [...departmentIds]),
    supabase
      .from("courses")
      .select("id, level_id")
      .in("department_id", [...departmentIds])
      .is("archived_at", null),
  ]);
  if (levels.error || courses.error) {
    throw new Error("Could not load courses", { cause: (levels.error ?? courses.error)?.code });
  }

  const published = courses.data.length
    ? await supabase
        .from("course_versions")
        .select("course_id")
        .eq("status", "published")
        .in(
          "course_id",
          courses.data.map((course) => course.id),
        )
    : { data: [], error: null };
  if (published.error) {
    throw new Error("Could not load courses", { cause: published.error.code });
  }
  const publishedIds = new Set(published.data.map((row) => row.course_id));

  return summariseLearning(
    departmentIds,
    levels.data.map((level) => ({
      id: level.id,
      departmentId: level.department_id,
      number: level.number,
      name: level.name,
    })),
    courses.data
      .filter((course) => publishedIds.has(course.id))
      .map((course) => ({ levelId: course.level_id })),
  );
}
