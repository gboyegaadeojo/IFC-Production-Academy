import "server-only";
import { createSupabaseServerClient } from "@/lib/data/supabase/server";
import { publicEnv } from "@/lib/env";
import { courseCoverUrl } from "@/lib/domain/library";
import { summarizeQuizzes, type AttemptResult, type QuizResult } from "@/lib/domain/quiz-results";

type Client = Awaited<ReturnType<typeof createSupabaseServerClient>>;

const toAttempt = (row: {
  course_id: string;
  quiz_key: string;
  attempt_number: number;
  correct_count: number | null;
  question_count: number;
  score_percent: number | null;
  passed: boolean | null;
  pass_percent: number;
}): AttemptResult => ({
  courseId: row.course_id,
  quizKey: row.quiz_key,
  attemptNumber: row.attempt_number,
  correct: row.correct_count ?? 0,
  total: row.question_count,
  score: row.score_percent ?? 0,
  passed: row.passed ?? false,
  passPercent: row.pass_percent,
});

export const ATTEMPT_RESULT_COLUMNS =
  "user_id, quiz_id, course_id, course_version_id, department_id, quiz_key, attempt_number, correct_count, question_count, score_percent, passed, pass_percent";

export function attemptFromRow(row: Parameters<typeof toAttempt>[0]): AttemptResult {
  return toAttempt(row);
}

export type MyQuiz = QuizResult & {
  courseTitle: string;
  quizTitle: string;
  hue: string;
  icon: string;
  coverUrl: string | null;
};

async function namesFor(
  supabase: Client,
  ids: { quiz: string[]; version: string[]; category: string[]; course: string[] },
) {
  const [quizzes, versions, categories, courses] = await Promise.all([
    supabase.from("quizzes").select("id, title").in("id", ids.quiz),
    supabase.from("course_versions").select("id, title").in("id", ids.version),
    supabase.from("departments").select("id, hue, icon").in("id", ids.category),
    supabase.from("courses").select("id, cover_image_path").in("id", ids.course),
  ]);
  const failed = quizzes.error ?? versions.error ?? categories.error ?? courses.error;
  if (failed) {
    throw new Error("Could not load quiz results", { cause: failed.code });
  }
  return {
    quizzes: quizzes.data ?? [],
    versions: versions.data ?? [],
    categories: categories.data ?? [],
    courses: courses.data ?? [],
  };
}

/**
 * This person's quizzes, each with its best score (ADD-REPORT-02), and how many lessons they've
 * marked complete. Row-level security limits both to their own.
 */
export async function getMyQuizResults(
  userId: string,
): Promise<{ quizzes: MyQuiz[]; lessonsComplete: number }> {
  const supabase = await createSupabaseServerClient();
  const [attempts, lessons] = await Promise.all([
    supabase
      .from("quiz_attempts")
      .select(ATTEMPT_RESULT_COLUMNS)
      .eq("user_id", userId)
      .not("submitted_at", "is", null)
      .order("submitted_at"),
    supabase
      .from("lesson_progress")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "completed"),
  ]);
  if (attempts.error || lessons.error) {
    throw new Error("Could not load quiz results", {
      cause: (attempts.error ?? lessons.error)?.code,
    });
  }
  const rows = attempts.data;
  const names = await namesFor(supabase, {
    quiz: [...new Set(rows.map((r) => r.quiz_id))],
    version: [...new Set(rows.map((r) => r.course_version_id))],
    category: [...new Set(rows.map((r) => r.department_id))],
    course: [...new Set(rows.map((r) => r.course_id))],
  });
  const { NEXT_PUBLIC_SUPABASE_URL: url } = publicEnv();
  const quizzes = summarizeQuizzes(rows.map(attemptFromRow)).flatMap((result) => {
    // The latest try's names, in case the course or quiz has been renamed since.
    const row = rows.findLast(
      (r) => r.course_id === result.courseId && r.quiz_key === result.quizKey,
    );
    if (!row) {
      return [];
    }
    const category = names.categories.find((c) => c.id === row.department_id);
    const cover = names.courses.find((c) => c.id === row.course_id)?.cover_image_path ?? null;
    return [
      {
        ...result,
        courseTitle:
          names.versions.find((v) => v.id === row.course_version_id)?.title ?? "A course",
        quizTitle: names.quizzes.find((q) => q.id === row.quiz_id)?.title ?? "Quiz",
        hue: category?.hue ?? "",
        icon: category?.icon ?? "",
        coverUrl: cover ? courseCoverUrl(url, cover) : null,
      },
    ];
  });
  return { quizzes, lessonsComplete: lessons.count ?? 0 };
}
