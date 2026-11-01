import "server-only";
import { createSupabaseServerClient } from "@/lib/data/supabase/server";
import { summariseLearning, type DepartmentLearning } from "@/lib/domain/home";

/**
 * Published courses per level in the given departments, with the learner's lessons marked complete
 * in each (DESIGN §6.1, SRS-MEM-006, SRS-PROG-002). Read-only. RLS limits courses to published,
 * non-archived ones, lessons to departments the person belongs to, and progress to their own rows.
 */
export async function getDepartmentLearning(
  userId: string,
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

  const courseIds = courses.data.map((course) => course.id);
  const published = courseIds.length
    ? await supabase
        .from("course_versions")
        .select("id, course_id")
        .eq("status", "published")
        .in("course_id", courseIds)
    : { data: [], error: null };
  if (published.error) {
    throw new Error("Could not load courses", { cause: published.error.code });
  }
  const versionIds = published.data.map((row) => row.id);
  const [lessons, progress] = await Promise.all([
    versionIds.length
      ? supabase
          .from("lessons")
          .select("course_version_id, lesson_key, is_required")
          .in("course_version_id", versionIds)
      : Promise.resolve({ data: [], error: null }),
    courseIds.length
      ? supabase
          .from("lesson_progress")
          .select("course_id, lesson_key")
          .eq("user_id", userId)
          .eq("status", "completed")
          .in("course_id", courseIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (lessons.error || progress.error) {
    throw new Error("Could not load progress", { cause: (lessons.error ?? progress.error)?.code });
  }

  // Completion carries across versions by the lesson's stable key (SRS-PROG-008).
  const completed = new Map<string, Set<string>>();
  for (const row of progress.data) {
    completed.set(row.course_id, (completed.get(row.course_id) ?? new Set()).add(row.lesson_key));
  }
  const versionByCourse = new Map(published.data.map((row) => [row.course_id, row.id]));

  return summariseLearning(
    departmentIds,
    levels.data.map((level) => ({
      id: level.id,
      departmentId: level.department_id,
      number: level.number,
      name: level.name,
    })),
    courses.data.flatMap((course) => {
      const versionId = versionByCourse.get(course.id);
      if (!versionId) {
        return [];
      }
      return [
        {
          levelId: course.level_id,
          lessons: lessons.data
            .filter((lesson) => lesson.course_version_id === versionId)
            .map((lesson) => ({ key: lesson.lesson_key, isRequired: lesson.is_required })),
          completedKeys: completed.get(course.id) ?? new Set<string>(),
        },
      ];
    }),
  );
}
