import "server-only";
import { getLearnerCourses } from "@/lib/data/pathway";
import { attemptFromRow, ATTEMPT_RESULT_COLUMNS } from "@/lib/data/quiz-results";
import { getTrainingReport } from "@/lib/data/reports";
import { createSupabaseServerClient } from "@/lib/data/supabase/server";
import { progressStatus, type CourseProgressView } from "@/lib/domain/course-progress";
import { summarizeQuizzes } from "@/lib/domain/quiz-results";

/**
 * One course's progress, person by person (ADD-REPORT-02). The learners and their states come from
 * the existing training report, and row-level security limits the details to people who may view
 * this department's reports. The number of calls doesn't grow with the people.
 */
export async function getCourseProgress(
  departmentId: string,
  requestedCourseId: string | null,
): Promise<{ courses: { id: string; title: string }[]; view: CourseProgressView | null }> {
  const report = await getTrainingReport(departmentId);
  const courses = [...new Map(report.map((row) => [row.courseId, row.courseTitle]))].map(
    ([id, title]) => ({ id, title }),
  );
  const courseId = courses.find((c) => c.id === requestedCourseId)?.id ?? courses[0]?.id ?? null;
  if (!courseId) {
    return { courses, view: null };
  }
  const supabase = await createSupabaseServerClient();
  const [outline, lessons, attempts, practicals, assignments] = await Promise.all([
    getLearnerCourses([courseId]).then((found) => found.get(courseId)),
    supabase
      .from("lesson_progress")
      .select("user_id, lesson_key")
      .eq("course_id", courseId)
      .eq("status", "completed"),
    supabase
      .from("quiz_attempts")
      .select(ATTEMPT_RESULT_COLUMNS)
      .eq("course_id", courseId)
      .not("submitted_at", "is", null),
    supabase
      .from("practical_assessments")
      .select("user_id, practical_key")
      .eq("course_id", courseId)
      .eq("outcome", "pass")
      .is("voided_at", null),
    supabase
      .from("course_assignments")
      .select("user_id, assigned_at")
      .eq("course_id", courseId)
      .is("removed_at", null),
  ]);
  const failed = lessons.error ?? attempts.error ?? practicals.error ?? assignments.error;
  if (failed) {
    throw new Error("Could not load course progress", { cause: failed.code });
  }
  if (!outline) {
    return { courses, view: null };
  }
  const rows = report.filter((row) => row.courseId === courseId);
  return {
    courses,
    view: {
      courseId,
      courseTitle: outline.title,
      level: outline.department.uses_levels ? outline.level.number : null,
      lessons: outline.modules.flatMap((m) =>
        m.lessons.map((l) => ({ key: l.key, title: l.title })),
      ),
      quizzes: outline.quizzes.map((q) => ({ key: q.key, title: q.title })),
      practicals: outline.practicals.map((p) => ({ key: p.key, title: p.title })),
      people: rows
        .map((row) => ({
          userId: row.userId,
          name: row.name,
          status: progressStatus(row.state),
          completedLessons: (lessons.data ?? [])
            .filter((l) => l.user_id === row.userId)
            .map((l) => l.lesson_key),
          quizzes: summarizeQuizzes(
            (attempts.data ?? []).filter((a) => a.user_id === row.userId).map(attemptFromRow),
          ),
          passedPracticals: (practicals.data ?? [])
            .filter((p) => p.user_id === row.userId)
            .map((p) => p.practical_key),
          assignedAt:
            (assignments.data ?? []).find((a) => a.user_id === row.userId)?.assigned_at ?? null,
        }))
        .toSorted((a, b) => a.name.localeCompare(b.name)),
    },
  };
}
