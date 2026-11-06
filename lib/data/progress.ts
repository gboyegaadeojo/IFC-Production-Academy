import "server-only";
import { cache } from "react";
import { getLearnerCourses, type LearnerCourse } from "@/lib/data/pathway";
import { getPassedPracticalKeys } from "@/lib/data/practicals";
import { getPassedQuizKeys } from "@/lib/data/quizzes";
import { createSupabaseServerClient } from "@/lib/data/supabase/server";
import { flattenLessons, stepHref } from "@/lib/domain/learning";
import {
  courseProgress,
  lessonProgressByKey,
  recentCourseIds,
  type CourseProgress,
  type LessonProgress,
  type ProgressRow,
} from "@/lib/domain/progress";
import { recentlyWatched, type RecentLesson, type WatchedLesson } from "@/lib/domain/training-home";

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

const PROGRESS_LIMIT = 2000;

async function readProgress(userId: string, courseIds?: readonly string[]): Promise<Row[]> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("lesson_progress")
    .select(COLUMNS)
    .eq("user_id", userId)
    .order("last_viewed_at", { ascending: false })
    .limit(PROGRESS_LIMIT);
  if (courseIds) {
    query = query.in("course_id", [...courseIds]);
  }
  const { data, error } = await query;
  if (error) {
    throw new Error("Could not load progress", { cause: error.code });
  }
  return data;
}

const readAllProgress = cache((userId: string) => readProgress(userId));

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
  // Sections of a page share one read of everything. Past the limit, that read may be missing a
  // course's rows, so ask for those courses directly.
  const everything = await readAllProgress(userId);
  let rows = everything;
  if (courseIds) {
    const wanted = new Set(courseIds);
    rows =
      everything.length < PROGRESS_LIMIT
        ? everything.filter((row) => wanted.has(row.course_id))
        : await readProgress(userId, courseIds);
  }
  const byCourse = new Map<string, Row[]>();
  for (const row of rows) {
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

/**
 * Starts a course over for this person (SRS-PROG-009). The database keeps what it clears, and leaves
 * certificates, practicals, competencies, and Approved to Serve alone.
 */
export async function restartCourse(courseId: string): Promise<ProgressResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("restart_course", { p_course_id: courseId });
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
  nextHref: string;
  /** Null when the next step is a quiz or a practical. */
  nextLesson: {
    number: number;
    total: number;
    minutes: number | null;
    thumbnailUrl: string | null;
  } | null;
  /** A required practical not passed yet, unless it's the next step. */
  practical: { title: string; href: string } | null;
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
  // Every opened course, not just these three: the rest of Training wants them too, and this way
  // they all come in one read.
  const opened = recentCourseIds(activity, memberDepartmentIds, activity.size);
  const ids = opened.slice(0, 3);
  const [courses, passed, practicalsPassed] = await Promise.all([
    getLearnerCourses(opened),
    getPassedQuizKeys(userId, opened),
    getPassedPracticalKeys(userId, opened),
  ]);
  return ids.flatMap((id) => {
    const course = courses.get(id);
    const entry = course ? activity.get(id) : undefined;
    if (!course || !course.canOpen || !entry) {
      return [];
    }
    const progress = courseProgress(
      course.modules,
      entry.lessons,
      course.quizzes,
      passed.get(course.id),
      course.practicals,
      practicalsPassed.get(course.id),
    );
    if (progress.state === "completed" || !progress.next) {
      return [];
    }
    const next = progress.next;
    const lessons = flattenLessons(course.modules);
    const lessonIndex = next.kind === "lesson" ? lessons.findIndex((l) => l.key === next.key) : -1;
    const lesson = lessons[lessonIndex];
    const practical = course.practicals.find(
      (item) =>
        item.isRequired && item.key !== next.key && !practicalsPassed.get(course.id)?.has(item.key),
    );
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
        nextHref: stepHref(course.id, next),
        nextLesson: lesson
          ? {
              number: lessonIndex + 1,
              total: lessons.length,
              minutes: lesson.estimatedMinutes,
              thumbnailUrl: lesson.thumbnailUrl ?? null,
            }
          : null,
        practical: practical
          ? {
              title: practical.title,
              href: stepHref(course.id, { kind: "practical", key: practical.key }),
            }
          : null,
      },
    ];
  });
}

/**
 * Each course's progress for one learner, by course id, using the same rule as the course page
 * (required lessons and quizzes; SRS-PROG-002). For the department page's course cards.
 */
export async function getCourseProgressById(
  userId: string,
  courseIds: readonly string[],
): Promise<Map<string, CourseProgress>> {
  if (courseIds.length === 0) {
    return new Map();
  }
  const [activity, courses, passed, practicalsPassed] = await Promise.all([
    getLearnerActivity(userId, courseIds),
    getLearnerCourses(courseIds),
    getPassedQuizKeys(userId, [...courseIds]),
    getPassedPracticalKeys(userId, [...courseIds]),
  ]);
  const out = new Map<string, CourseProgress>();
  for (const course of courses.values()) {
    if (!course.canOpen) {
      continue;
    }
    out.set(
      course.id,
      courseProgress(
        course.modules,
        activity.get(course.id)?.lessons ?? new Map(),
        course.quizzes,
        passed.get(course.id),
        course.practicals,
        practicalsPassed.get(course.id),
      ),
    );
  }
  return out;
}

/**
 * The lessons opened most recently, for Recently watched on Training (mock 5). One read of the
 * learner's progress, shared with the rest of the page, then the courses those lessons are in.
 */
export async function getRecentlyWatched(userId: string, limit = 4): Promise<RecentLesson[]> {
  const rows = await readAllProgress(userId);
  // Enough of the newest rows to find `limit` different lessons, even after several versions.
  const recent = rows.slice(0, limit * 6);
  const courseIds = [...new Set(recent.map((row) => row.course_id))];
  if (courseIds.length === 0) {
    return [];
  }
  const courses = await getLearnerCourses(courseIds);
  const lessons = new Map<string, WatchedLesson>();
  for (const course of courses.values()) {
    if (!course.canOpen) {
      continue;
    }
    for (const lesson of flattenLessons(course.modules)) {
      lessons.set(`${course.id}:${lesson.key}`, {
        title: lesson.title,
        courseTitle: course.title,
        href: stepHref(course.id, { kind: "lesson", key: lesson.key }),
        minutes: lesson.estimatedMinutes,
        thumbnailUrl: lesson.thumbnailUrl ?? null,
      });
    }
  }
  return recentlyWatched(
    recent.map((row) => ({
      courseId: row.course_id,
      lessonKey: row.lesson_key,
      status: row.status,
      positionSeconds: row.position_seconds,
      lastViewedAt: row.last_viewed_at,
      completedAt: row.completed_at,
    })),
    lessons,
    limit,
  );
}
