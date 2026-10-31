import "server-only";
import { getLearnerCourse, type LearnerCourse } from "@/lib/data/pathway";
import { getPassedQuizKeys } from "@/lib/data/quizzes";
import { createSupabaseServerClient } from "@/lib/data/supabase/server";
import {
  courseProgress,
  lessonProgressByKey,
  recentCourseIds,
  type CourseProgress,
  type LessonProgress,
  type ProgressRow,
} from "@/lib/domain/progress";

// Lesson progress (SRS-PROG-001..005). Reads are the learner's own rows (RLS). Writes go through
// idempotent database functions that check membership and that the lesson is live.

const COLUMNS =
  "course_id, department_id, lesson_key, status, position_seconds, last_viewed_at, completed_at";

type Row = {
  course_id: string;
  department_id: string;
  lesson_key: string;
  status: "in_progress" | "completed";
  position_seconds: number;
  last_viewed_at: string;
  completed_at: string | null;
};

function toProgressRow(row: Row): ProgressRow {
  return {
    lessonKey: row.lesson_key,
    status: row.status,
    positionSeconds: row.position_seconds,
    lastViewedAt: row.last_viewed_at,
    completedAt: row.completed_at,
  };
}

/** The learner's progress in one course, by lesson key, across every version they studied. */
export async function getCourseProgress(
  userId: string,
  courseId: string,
): Promise<Map<string, LessonProgress>> {
  return (await getProgressForCourses(userId, [courseId])).get(courseId) ?? new Map();
}

/** The learner's progress per course, and when they last opened each one. */
export async function getProgressForCourses(
  userId: string,
  courseIds: readonly string[],
): Promise<Map<string, Map<string, LessonProgress>>> {
  return new Map(
    [...(await getLearnerActivity(userId, courseIds))].map(([id, { lessons }]) => [id, lessons]),
  );
}

export type CourseActivity = {
  departmentId: string;
  lessons: Map<string, LessonProgress>;
  lastViewedAt: string;
};

/** Courses the learner has opened, newest first. Optionally limited to some courses. */
export async function getLearnerActivity(
  userId: string,
  courseIds?: readonly string[],
): Promise<Map<string, CourseActivity>> {
  if (courseIds && courseIds.length === 0) {
    return new Map();
  }
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("lesson_progress")
    .select(COLUMNS)
    .eq("user_id", userId)
    .order("last_viewed_at", { ascending: false })
    .limit(2000);
  if (courseIds) {
    query = query.in("course_id", [...courseIds]);
  }
  const { data, error } = await query;
  if (error) {
    throw new Error("Could not load progress", { cause: error.code });
  }
  const byCourse = new Map<string, Row[]>();
  for (const row of data) {
    byCourse.set(row.course_id, [...(byCourse.get(row.course_id) ?? []), row]);
  }
  return new Map(
    [...byCourse].map(([courseId, rows]) => [
      courseId,
      {
        departmentId: rows[0]?.department_id ?? "",
        lessons: lessonProgressByKey(rows.map(toProgressRow)),
        lastViewedAt: rows[0]?.last_viewed_at ?? "",
      },
    ]),
  );
}

export type ProgressResult = { ok: true } | { ok: false; error: "not_authorized" | "unknown" };

function result(error: { code?: string } | null): ProgressResult {
  if (!error) {
    return { ok: true };
  }
  return { ok: false, error: error.code === "42501" ? "not_authorized" : "unknown" };
}

export async function recordLessonView(
  courseId: string,
  lessonKey: string,
  positionSeconds: number | null,
): Promise<ProgressResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("record_lesson_view", {
    p_course_id: courseId,
    p_lesson_key: lessonKey,
    p_position_seconds: positionSeconds,
  });
  return result(error);
}

export async function completeLesson(courseId: string, lessonKey: string): Promise<ProgressResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("complete_lesson", {
    p_course_id: courseId,
    p_lesson_key: lessonKey,
  });
  return result(error);
}

export async function reopenLesson(courseId: string, lessonKey: string): Promise<ProgressResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("reopen_lesson", {
    p_course_id: courseId,
    p_lesson_key: lessonKey,
  });
  return result(error);
}

export type ContinueCourse = {
  course: Pick<LearnerCourse, "id" | "title" | "department" | "level">;
  progress: CourseProgress;
  hasRequired: boolean;
};

/** Up to three recently opened, unfinished courses for Home. Empty when nothing was started. */
export async function getContinueLearning(
  userId: string,
  memberDepartmentIds: readonly string[],
): Promise<ContinueCourse[]> {
  if (memberDepartmentIds.length === 0) {
    return [];
  }
  const activity = await getLearnerActivity(userId);
  const ids = recentCourseIds(activity, memberDepartmentIds, 3);
  const [courses, passed] = await Promise.all([
    Promise.all(ids.map((id) => getLearnerCourse(id))),
    getPassedQuizKeys(userId, ids),
  ]);
  return courses.flatMap((course) => {
    const entry = course ? activity.get(course.id) : undefined;
    if (!course || !course.canOpen || !entry) {
      return [];
    }
    const progress = courseProgress(
      course.modules,
      entry.lessons,
      course.quizzes,
      passed.get(course.id),
    );
    if (progress.state === "completed" || !progress.next) {
      return [];
    }
    return [
      {
        course: {
          id: course.id,
          title: course.title,
          department: course.department,
          level: course.level,
        },
        progress,
        hasRequired: course.modules.some((m) => m.lessons.some((l) => l.isRequired)),
      },
    ];
  });
}
