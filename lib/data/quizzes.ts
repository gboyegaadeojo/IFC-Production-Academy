import "server-only";
import { peopleById, personFor, type PersonSummary } from "@/lib/data/admin/shared";
import { createSupabaseServerClient } from "@/lib/data/supabase/server";
import { reorder, toCurriculumError, type CurriculumError } from "@/lib/domain/curriculum";
import {
  quizStatus,
  toQuizError,
  type AnswerPolicy,
  type Answers,
  type AttemptSummary,
  type LearnerOption,
  type QuestionInput,
  type QuestionKind,
  type QuizError,
  type QuizOption,
  type QuizSettings,
  type QuizStatus,
} from "@/lib/domain/quiz";

// Quizzes (SRS-QUIZ-001..007). Learners never read questions directly: the database hands them out
// per attempt without the correct answers, and scores the attempt itself. Editing works like
// lessons: drafts only, checked by row-level security.

export type QuizResult = { ok: true } | { ok: false; error: QuizError };
type WithId<T, E> = { ok: true; id: T } | { ok: false; error: E };
type EditResult = { ok: true } | { ok: false; error: CurriculumError };

function editFail(error: { code?: string; message?: string } | null): {
  ok: false;
  error: CurriculumError;
} {
  return { ok: false, error: toCurriculumError(error) };
}

function quizFail(error: { code?: string; message?: string } | null): {
  ok: false;
  error: QuizError;
} {
  return { ok: false, error: toQuizError(error) };
}

/** An update that RLS filtered out returns no rows, so treat that as not authorized. */
function updated(result: {
  data: unknown[] | null;
  error: { code?: string; message?: string } | null;
}): EditResult {
  if (result.error) {
    return editFail(result.error);
  }
  return (result.data?.length ?? 0) > 0 ? { ok: true } : editFail({ code: "42501" });
}

function asOptions(value: unknown): QuizOption[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((option: unknown) => {
    if (typeof option !== "object" || option === null) {
      return [];
    }
    const { key, label, correct } = option as Record<string, unknown>;
    return typeof key === "string" && typeof label === "string"
      ? [{ key, label, correct: correct === true }]
      : [];
  });
}

function asKeys(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((key): key is string => typeof key === "string") : [];
}

// ---------------------------------------------------------------------------
// Learner
// ---------------------------------------------------------------------------

export type LearnerQuiz = {
  id: string;
  key: string;
  title: string;
  intro: string;
  passPercent: number;
  maxAttempts: number | null;
  answerPolicy: AnswerPolicy;
  isRequired: boolean;
};

/** A quiz in a published version, by its stable key. Null if not readable. */
export async function getLearnerQuiz(
  versionId: string,
  quizKey: string,
): Promise<LearnerQuiz | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("quizzes")
    .select("id, quiz_key, title, intro, pass_percent, max_attempts, answer_policy, is_required")
    .eq("course_version_id", versionId)
    .eq("quiz_key", quizKey)
    .maybeSingle();
  if (error) {
    throw new Error("Could not load the quiz", { cause: error.code });
  }
  return data
    ? {
        id: data.id,
        key: data.quiz_key,
        title: data.title,
        intro: data.intro,
        passPercent: data.pass_percent,
        maxAttempts: data.max_attempts,
        answerPolicy: data.answer_policy,
        isRequired: data.is_required,
      }
    : null;
}

const ATTEMPT_COLUMNS =
  "id, quiz_key, course_id, course_version_id, attempt_number, started_at, submitted_at, score_percent, passed, question_count, correct_count, pass_percent";

type AttemptRow = {
  id: string;
  quiz_key: string;
  course_id: string;
  course_version_id: string;
  attempt_number: number;
  started_at: string;
  submitted_at: string | null;
  score_percent: number | null;
  passed: boolean | null;
  question_count: number;
  correct_count: number | null;
  pass_percent: number;
};

function toSummary(row: AttemptRow): AttemptSummary {
  return {
    id: row.id,
    attemptNumber: row.attempt_number,
    startedAt: row.started_at,
    submittedAt: row.submitted_at,
    scorePercent: row.score_percent,
    passed: row.passed,
  };
}

/** The learner's attempts at one quiz across every version, oldest first, and extra attempts. */
export async function getMyQuizAttempts(
  userId: string,
  courseId: string,
  quizKey: string,
): Promise<{ attempts: AttemptSummary[]; extraAttempts: number }> {
  const supabase = await createSupabaseServerClient();
  const [attempts, allowances] = await Promise.all([
    supabase
      .from("quiz_attempts")
      .select(ATTEMPT_COLUMNS)
      .eq("user_id", userId)
      .eq("course_id", courseId)
      .eq("quiz_key", quizKey)
      .order("attempt_number"),
    supabase
      .from("quiz_attempt_allowances")
      .select("extra_attempts")
      .eq("user_id", userId)
      .eq("course_id", courseId)
      .eq("quiz_key", quizKey),
  ]);
  if (attempts.error || allowances.error) {
    throw new Error("Could not load quiz attempts", {
      cause: (attempts.error ?? allowances.error)?.code,
    });
  }
  return {
    attempts: attempts.data.map(toSummary),
    extraAttempts: allowances.data.reduce((total, row) => total + row.extra_attempts, 0),
  };
}

/** Quiz keys the learner has passed, per course (any version counts). */
export async function getPassedQuizKeys(
  userId: string,
  courseIds: readonly string[],
): Promise<Map<string, Set<string>>> {
  const passed = new Map<string, Set<string>>();
  if (courseIds.length === 0) {
    return passed;
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("quiz_attempts")
    .select("course_id, quiz_key")
    .eq("user_id", userId)
    .eq("passed", true)
    .in("course_id", [...courseIds]);
  if (error) {
    throw new Error("Could not load quiz results", { cause: error.code });
  }
  for (const row of data) {
    passed.set(row.course_id, (passed.get(row.course_id) ?? new Set()).add(row.quiz_key));
  }
  return passed;
}

export type MyAttempt = AttemptSummary & {
  quizKey: string;
  courseId: string;
  courseVersionId: string;
  questionCount: number;
  correctCount: number | null;
  passPercent: number;
};

/** One of the learner's own attempts (RLS). Null if it isn't theirs. */
export async function getMyAttempt(userId: string, attemptId: string): Promise<MyAttempt | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("quiz_attempts")
    .select(ATTEMPT_COLUMNS)
    .eq("id", attemptId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    throw new Error("Could not load the attempt", { cause: error.code });
  }
  return data
    ? {
        ...toSummary(data),
        quizKey: data.quiz_key,
        courseId: data.course_id,
        courseVersionId: data.course_version_id,
        questionCount: data.question_count,
        correctCount: data.correct_count,
        passPercent: data.pass_percent,
      }
    : null;
}

export type AttemptQuestion = {
  id: string;
  kind: QuestionKind;
  prompt: string;
  scenario: string;
  options: LearnerOption[];
};

/** The attempt's questions in the order this learner sees them, without the correct answers. */
export async function getAttemptQuestions(attemptId: string): Promise<AttemptQuestion[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("quiz_attempt_questions", {
    p_attempt_id: attemptId,
  });
  if (error) {
    throw new Error("Could not load the questions", { cause: error.code });
  }
  return data.map((row) => ({
    id: row.question_id,
    kind: row.kind,
    prompt: row.prompt,
    scenario: row.scenario,
    options: asOptions(row.options).map(({ key, label }) => ({ key, label })),
  }));
}

export type ReviewQuestion = {
  id: string;
  kind: QuestionKind;
  prompt: string;
  scenario: string;
  /** correct is present only when the answer policy allows. */
  options: (LearnerOption & { correct?: boolean })[];
  selected: string[];
  isCorrect: boolean | null;
  explanation: string;
};

/** A submitted attempt question by question; correct answers only when the policy allows. */
export async function getAttemptReview(attemptId: string): Promise<ReviewQuestion[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("quiz_attempt_review", { p_attempt_id: attemptId });
  if (error) {
    throw new Error("Could not load the review", { cause: error.code });
  }
  return data.map((row) => ({
    id: row.question_id,
    kind: row.kind,
    prompt: row.prompt,
    scenario: row.scenario,
    options: asOptions(row.options).map((option, index) => {
      const raw: unknown = Array.isArray(row.options) ? row.options[index] : null;
      const hasCorrect = typeof raw === "object" && raw !== null && "correct" in raw;
      return hasCorrect
        ? { key: option.key, label: option.label, correct: option.correct }
        : { key: option.key, label: option.label };
    }),
    selected: asKeys(row.selected),
    isCorrect: row.is_correct,
    explanation: row.explanation,
  }));
}

export async function startQuizAttempt(
  courseId: string,
  quizKey: string,
): Promise<WithId<string, QuizError>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("start_quiz_attempt", {
    p_course_id: courseId,
    p_quiz_key: quizKey,
  });
  return error ? quizFail(error) : { ok: true, id: data };
}

export async function submitQuizAttempt(
  attemptId: string,
  answers: Answers,
): Promise<WithId<boolean, QuizError>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("submit_quiz_attempt", {
    p_attempt_id: attemptId,
    p_answers: Object.fromEntries(Object.entries(answers).map(([id, keys]) => [id, [...keys]])),
  });
  return error ? quizFail(error) : { ok: true, id: data };
}

// ---------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------

export type QuizOutline = {
  id: string;
  key: string;
  title: string;
  afterModuleKey: string | null;
  isRequired: boolean;
  passPercent: number;
  maxAttempts: number | null;
  questionCount: number;
  sortOrder: number;
};

/** A version's quizzes for the course editor, with how many questions each has. */
export async function getVersionQuizzes(versionId: string): Promise<QuizOutline[]> {
  const supabase = await createSupabaseServerClient();
  const [quizzes, questions] = await Promise.all([
    supabase
      .from("quizzes")
      .select(
        "id, quiz_key, title, after_module_key, is_required, pass_percent, max_attempts, sort_order",
      )
      .eq("course_version_id", versionId)
      .order("sort_order"),
    supabase.from("quiz_questions").select("quiz_id").eq("course_version_id", versionId),
  ]);
  if (quizzes.error || questions.error) {
    throw new Error("Could not load quizzes", { cause: (quizzes.error ?? questions.error)?.code });
  }
  return quizzes.data.map((quiz) => ({
    id: quiz.id,
    key: quiz.quiz_key,
    title: quiz.title,
    afterModuleKey: quiz.after_module_key,
    isRequired: quiz.is_required,
    passPercent: quiz.pass_percent,
    maxAttempts: quiz.max_attempts,
    questionCount: questions.data.filter((row) => row.quiz_id === quiz.id).length,
    sortOrder: quiz.sort_order,
  }));
}

export type EditorQuestion = {
  id: string;
  kind: QuestionKind;
  prompt: string;
  scenario: string;
  explanation: string;
  options: QuizOption[];
  sortOrder: number;
};

export type QuizEditor = {
  id: string;
  key: string;
  courseId: string;
  courseVersionId: string;
  departmentId: string;
  editable: boolean;
  settings: QuizSettings;
  modules: { key: string; title: string }[];
  questions: EditorQuestion[];
};

export async function getQuizEditor(quizId: string): Promise<QuizEditor | null> {
  const supabase = await createSupabaseServerClient();
  const quiz = await supabase
    .from("quizzes")
    .select(
      "id, quiz_key, course_version_id, title, intro, after_module_key, pass_percent, max_attempts, shuffle_questions, answer_policy, is_required",
    )
    .eq("id", quizId)
    .maybeSingle();
  if (quiz.error) {
    throw new Error("Could not load the quiz", { cause: quiz.error.code });
  }
  if (!quiz.data) {
    return null;
  }
  const [version, modules, questions] = await Promise.all([
    supabase
      .from("course_versions")
      .select("course_id, status")
      .eq("id", quiz.data.course_version_id)
      .single(),
    supabase
      .from("course_modules")
      .select("module_key, title")
      .eq("course_version_id", quiz.data.course_version_id)
      .order("sort_order"),
    supabase
      .from("quiz_questions")
      .select("id, kind, prompt, scenario, explanation, options, sort_order")
      .eq("quiz_id", quizId)
      .order("sort_order"),
  ]);
  if (version.error || modules.error || questions.error) {
    throw new Error("Could not load the quiz", {
      cause: (version.error ?? modules.error ?? questions.error)?.code,
    });
  }
  const course = await supabase
    .from("courses")
    .select("department_id")
    .eq("id", version.data.course_id)
    .single();
  if (course.error) {
    throw new Error("Could not load the quiz", { cause: course.error.code });
  }
  const moduleKeys = new Set(modules.data.map((m) => m.module_key));
  return {
    id: quiz.data.id,
    key: quiz.data.quiz_key,
    courseId: version.data.course_id,
    courseVersionId: quiz.data.course_version_id,
    departmentId: course.data.department_id,
    editable: version.data.status === "draft",
    settings: {
      title: quiz.data.title,
      intro: quiz.data.intro,
      placement:
        quiz.data.after_module_key && moduleKeys.has(quiz.data.after_module_key)
          ? quiz.data.after_module_key
          : "end",
      passPercent: quiz.data.pass_percent,
      maxAttempts: quiz.data.max_attempts,
      answerPolicy: quiz.data.answer_policy,
      shuffleQuestions: quiz.data.shuffle_questions,
      isRequired: quiz.data.is_required,
    },
    modules: modules.data.map((m) => ({ key: m.module_key, title: m.title })),
    questions: questions.data.map((q) => ({
      id: q.id,
      kind: q.kind,
      prompt: q.prompt,
      scenario: q.scenario,
      explanation: q.explanation,
      options: asOptions(q.options),
      sortOrder: q.sort_order,
    })),
  };
}

function nextOrder(rows: readonly { sort_order: number }[]): number {
  return rows.reduce((max, row) => Math.max(max, row.sort_order), 0) + 10;
}

export async function addQuiz(
  versionId: string,
  quiz: { title: string; placement: string },
): Promise<WithId<string, CurriculumError>> {
  const supabase = await createSupabaseServerClient();
  const existing = await supabase
    .from("quizzes")
    .select("sort_order")
    .eq("course_version_id", versionId);
  const { data, error } = await supabase
    .from("quizzes")
    .insert({
      course_version_id: versionId,
      title: quiz.title,
      after_module_key: quiz.placement === "end" ? null : quiz.placement,
      sort_order: nextOrder(existing.data ?? []),
    })
    .select("id")
    .single();
  return error ? editFail(error) : { ok: true, id: data.id };
}

export async function updateQuiz(quizId: string, settings: QuizSettings): Promise<EditResult> {
  const supabase = await createSupabaseServerClient();
  return updated(
    await supabase
      .from("quizzes")
      .update({
        title: settings.title,
        intro: settings.intro,
        after_module_key: settings.placement === "end" ? null : settings.placement,
        pass_percent: settings.passPercent,
        max_attempts: settings.maxAttempts,
        answer_policy: settings.answerPolicy,
        shuffle_questions: settings.shuffleQuestions,
        is_required: settings.isRequired,
      })
      .eq("id", quizId)
      .select("id"),
  );
}

export async function deleteQuiz(quizId: string): Promise<EditResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("delete_quiz", { p_quiz_id: quizId });
  return error ? editFail(error) : { ok: true };
}

export async function addQuestion(
  quizId: string,
  versionId: string,
  question: QuestionInput,
): Promise<WithId<string, CurriculumError>> {
  const supabase = await createSupabaseServerClient();
  const existing = await supabase.from("quiz_questions").select("sort_order").eq("quiz_id", quizId);
  const { data, error } = await supabase
    .from("quiz_questions")
    .insert({
      quiz_id: quizId,
      course_version_id: versionId,
      kind: question.kind,
      prompt: question.prompt,
      scenario: question.scenario,
      explanation: question.explanation,
      options: question.options,
      sort_order: nextOrder(existing.data ?? []),
    })
    .select("id")
    .single();
  return error ? editFail(error) : { ok: true, id: data.id };
}

export async function updateQuestion(
  questionId: string,
  question: QuestionInput,
): Promise<EditResult> {
  const supabase = await createSupabaseServerClient();
  return updated(
    await supabase
      .from("quiz_questions")
      .update({
        kind: question.kind,
        prompt: question.prompt,
        scenario: question.scenario,
        explanation: question.explanation,
        options: question.options,
      })
      .eq("id", questionId)
      .select("id"),
  );
}

export async function deleteQuestion(questionId: string): Promise<EditResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("delete_quiz_question", { p_question_id: questionId });
  return error ? editFail(error) : { ok: true };
}

/** Swaps a question with its neighbour. */
export async function moveQuestion(
  questionId: string,
  direction: "up" | "down",
): Promise<EditResult> {
  const supabase = await createSupabaseServerClient();
  const item = await supabase
    .from("quiz_questions")
    .select("quiz_id")
    .eq("id", questionId)
    .maybeSingle();
  if (item.error || !item.data) {
    return editFail(item.error ?? { code: "42501" });
  }
  const siblings = await supabase
    .from("quiz_questions")
    .select("id, sort_order")
    .eq("quiz_id", item.data.quiz_id)
    .order("sort_order");
  if (siblings.error) {
    return editFail(siblings.error);
  }
  const changes = reorder(
    siblings.data.map((row) => ({ id: row.id, sortOrder: row.sort_order })),
    questionId,
    direction,
  );
  for (const change of changes) {
    const result = updated(
      await supabase
        .from("quiz_questions")
        .update({ sort_order: change.sortOrder })
        .eq("id", change.id)
        .select("id"),
    );
    if (!result.ok) {
      return result;
    }
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Results for trainers and leaders (SRS-QUIZ-007)
// ---------------------------------------------------------------------------

export type QuizResultRow = {
  person: PersonSummary;
  status: QuizStatus;
  attempts: (AttemptSummary & { versionNumber: number | null; questionCount: number })[];
};

/**
 * Everyone's attempts at a quiz across versions, newest activity first. Row-level security limits
 * it to report viewers for the department.
 */
export async function getQuizResults(
  courseId: string,
  quizKey: string,
  maxAttempts: number | null,
): Promise<QuizResultRow[]> {
  const supabase = await createSupabaseServerClient();
  const [attempts, allowances, versions] = await Promise.all([
    supabase
      .from("quiz_attempts")
      .select(`${ATTEMPT_COLUMNS}, user_id`)
      .eq("course_id", courseId)
      .eq("quiz_key", quizKey)
      .order("attempt_number")
      .limit(5000),
    supabase
      .from("quiz_attempt_allowances")
      .select("user_id, extra_attempts")
      .eq("course_id", courseId)
      .eq("quiz_key", quizKey),
    supabase.from("course_versions").select("id, version_number").eq("course_id", courseId),
  ]);
  if (attempts.error || allowances.error || versions.error) {
    throw new Error("Could not load quiz results", {
      cause: (attempts.error ?? allowances.error ?? versions.error)?.code,
    });
  }
  const versionNumbers = new Map(versions.data.map((v) => [v.id, v.version_number]));
  const byPerson = new Map<string, (AttemptRow & { user_id: string })[]>();
  for (const row of attempts.data) {
    byPerson.set(row.user_id, [...(byPerson.get(row.user_id) ?? []), row]);
  }
  const people = await peopleById(supabase, byPerson.keys());
  const rows = [...byPerson].map(([userId, list]) => {
    const extra = allowances.data
      .filter((row) => row.user_id === userId)
      .reduce((total, row) => total + row.extra_attempts, 0);
    const summaries = list.map(toSummary);
    return {
      person: personFor(people, userId),
      status: quizStatus(maxAttempts, summaries, extra),
      attempts: list.map((row) => ({
        ...toSummary(row),
        versionNumber: versionNumbers.get(row.course_version_id) ?? null,
        questionCount: row.question_count,
      })),
      latest: list.reduce((latest, row) => {
        const at = row.submitted_at ?? row.started_at;
        return at > latest ? at : latest;
      }, ""),
    };
  });
  return rows
    .toSorted((a, b) => (a.latest < b.latest ? 1 : -1))
    .map(({ person, status, attempts: list }) => ({ person, status, attempts: list }));
}

export async function grantQuizAttempt(
  userId: string,
  courseId: string,
  quizKey: string,
  reason: string,
): Promise<QuizResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("grant_quiz_attempt", {
    p_user_id: userId,
    p_course_id: courseId,
    p_quiz_key: quizKey,
    p_reason: reason,
  });
  return error ? quizFail(error) : { ok: true };
}
