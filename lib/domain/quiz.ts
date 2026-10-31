/**
 * Quiz rules (SRS-QUIZ-001..007). Pure functions, so the editor, the learner pages, and the tests
 * agree. The database scores attempts and enforces the attempt limit; nothing here decides a result
 * (decided 2026-10-30). Passing a quiz never grants a competency or Approved to Serve (SPEC §3).
 */
import { z } from "zod";

export type QuestionKind = "single" | "multiple" | "true_false" | "scenario";
export type AnswerPolicy = "after_each_attempt" | "after_pass" | "after_final_attempt" | "never";

export const QUESTION_KINDS: readonly QuestionKind[] = [
  "single",
  "multiple",
  "true_false",
  "scenario",
];

export const QUESTION_KIND_LABELS: Record<QuestionKind, string> = {
  single: "Multiple choice (one answer)",
  multiple: "Multiple select (one or more answers)",
  true_false: "True or false",
  scenario: "Scenario (a situation, then one answer)",
};

export const ANSWER_POLICIES: readonly AnswerPolicy[] = [
  "after_final_attempt",
  "after_pass",
  "after_each_attempt",
  "never",
];

export const ANSWER_POLICY_LABELS: Record<AnswerPolicy, string> = {
  after_final_attempt: "After they pass or use every attempt",
  after_pass: "Only after they pass",
  after_each_attempt: "After every attempt",
  never: "Never",
};

/** What learners are told about seeing the answers. */
export const ANSWER_POLICY_LEARNER_TEXT: Record<AnswerPolicy, string> = {
  after_final_attempt: "You'll see the correct answers once you pass or have used every attempt.",
  after_pass: "You'll see the correct answers once you pass.",
  after_each_attempt: "You'll see the correct answers after each attempt.",
  never: "Correct answers aren't shown for this quiz.",
};

/** SRS-QUIZ-003. */
export const DEFAULT_PASS_PERCENT = 80;
export const DEFAULT_MAX_ATTEMPTS = 3;
export const MAX_OPTIONS = 6;
export const MAX_QUESTIONS = 50;

const OPTION_KEYS = ["a", "b", "c", "d", "e", "f"] as const;

export type QuizOption = { key: string; label: string; correct: boolean };
/** What learners see: never whether an option is correct. */
export type LearnerOption = { key: string; label: string };

// ---------------------------------------------------------------------------
// Editor validation (mirrors private.quiz_options_valid)
// ---------------------------------------------------------------------------

const titleField = z
  .string()
  .transform((value) => value.replace(/\s+/g, " ").trim())
  .pipe(z.string().min(1, "Give it a title.").max(120, "Keep the title under 120 characters."));

/** "end" or a module key: where the quiz sits in the course. */
const placementField = z.union([z.literal("end"), z.uuid()]);

export const quizSettingsSchema = z.object({
  title: titleField,
  intro: z.string().trim().max(1000, "Keep the introduction under 1,000 characters."),
  placement: placementField,
  passPercent: z.coerce
    .number()
    .int("Enter a whole number.")
    .min(1, "The pass mark must be at least 1%.")
    .max(100, "The pass mark can't be more than 100%."),
  /** "unlimited" or a number of attempts. */
  maxAttempts: z.union([
    z.literal("unlimited").transform(() => null),
    z.coerce
      .number()
      .int()
      .min(1, "Allow at least one attempt.")
      .max(20, "Allow up to 20 attempts."),
  ]),
  answerPolicy: z.enum(["after_each_attempt", "after_pass", "after_final_attempt", "never"]),
  shuffleQuestions: z.boolean(),
  isRequired: z.boolean(),
});

export type QuizSettings = z.output<typeof quizSettingsSchema>;

export const newQuizSchema = z.object({ title: titleField, placement: placementField });

/**
 * A question from the editor form. Option rows left blank are dropped; true/false always gets the
 * two fixed options. Keys are a–f in the order shown.
 */
export const questionSchema = z
  .object({
    kind: z.enum(["single", "multiple", "true_false", "scenario"]),
    prompt: z
      .string()
      .trim()
      .min(1, "Write the question.")
      .max(1000, "Keep the question under 1,000 characters."),
    scenario: z.string().trim().max(2000, "Keep the scenario under 2,000 characters."),
    explanation: z.string().trim().max(1000, "Keep the explanation under 1,000 characters."),
    options: z
      .array(
        z.object({
          label: z.string().trim().max(300, "Keep each answer under 300 characters."),
          correct: z.boolean(),
        }),
      )
      .max(MAX_OPTIONS),
    /** For true/false only: which statement is right. */
    trueFalseAnswer: z.enum(["true", "false"]).optional(),
  })
  .transform((value, context) => {
    if (value.kind === "true_false") {
      if (!value.trueFalseAnswer) {
        context.addIssue({
          code: "custom",
          message: "Choose whether the statement is true or false.",
        });
        return z.NEVER;
      }
      return {
        kind: value.kind,
        prompt: value.prompt,
        scenario: "",
        explanation: value.explanation,
        options: [
          { key: "a", label: "True", correct: value.trueFalseAnswer === "true" },
          { key: "b", label: "False", correct: value.trueFalseAnswer === "false" },
        ],
      };
    }
    if (value.kind === "scenario" && value.scenario === "") {
      context.addIssue({ code: "custom", message: "Describe the situation for the scenario." });
      return z.NEVER;
    }
    const filled = value.options.filter((option) => option.label !== "");
    if (filled.length < 2) {
      context.addIssue({ code: "custom", message: "Give at least two answers to choose from." });
      return z.NEVER;
    }
    const correct = filled.filter((option) => option.correct).length;
    if (value.kind === "multiple" ? correct < 1 : correct !== 1) {
      context.addIssue({
        code: "custom",
        message:
          value.kind === "multiple"
            ? "Mark at least one answer as correct."
            : "Mark exactly one answer as correct.",
      });
      return z.NEVER;
    }
    return {
      kind: value.kind,
      prompt: value.prompt,
      scenario: value.kind === "scenario" ? value.scenario : "",
      explanation: value.explanation,
      options: filled.map((option, index) => ({
        key: OPTION_KEYS[index] ?? "f",
        label: option.label,
        correct: option.correct,
      })),
    };
  });

export type QuestionInput = z.output<typeof questionSchema>;

// ---------------------------------------------------------------------------
// Attempts and status
// ---------------------------------------------------------------------------

export type AttemptSummary = {
  id: string;
  attemptNumber: number;
  startedAt: string;
  submittedAt: string | null;
  scorePercent: number | null;
  passed: boolean | null;
};

export type QuizState = "not_started" | "in_progress" | "passed" | "can_retry" | "out_of_attempts";

export type QuizStatus = {
  state: QuizState;
  attemptsUsed: number;
  /** Null when attempts are unlimited. */
  attemptsAllowed: number | null;
  attemptsLeft: number | null;
  openAttemptId: string | null;
  bestScore: number | null;
  passedAt: string | null;
};

/**
 * Where a learner stands on a quiz, from their attempts across every version of it. The database
 * applies the same limit when an attempt starts.
 */
export function quizStatus(
  maxAttempts: number | null,
  attempts: readonly AttemptSummary[],
  extraAttempts = 0,
): QuizStatus {
  const attemptsAllowed = maxAttempts === null ? null : maxAttempts + extraAttempts;
  const attemptsUsed = attempts.length;
  const attemptsLeft =
    attemptsAllowed === null ? null : Math.max(0, attemptsAllowed - attemptsUsed);
  const open = attempts.find((attempt) => attempt.submittedAt === null) ?? null;
  const passes = attempts
    .filter((attempt) => attempt.passed && attempt.submittedAt !== null)
    .toSorted((a, b) => ((a.submittedAt ?? "") < (b.submittedAt ?? "") ? -1 : 1));
  const scores = attempts.flatMap((attempt) =>
    attempt.scorePercent === null ? [] : [attempt.scorePercent],
  );
  const bestScore = scores.length > 0 ? Math.max(...scores) : null;
  const base = {
    attemptsUsed,
    attemptsAllowed,
    attemptsLeft,
    openAttemptId: open?.id ?? null,
    bestScore,
    passedAt: passes[0]?.submittedAt ?? null,
  };

  if (passes.length > 0) {
    return { ...base, state: "passed" };
  }
  if (open) {
    return { ...base, state: "in_progress" };
  }
  if (attemptsUsed === 0) {
    return { ...base, state: "not_started" };
  }
  return { ...base, state: attemptsLeft === 0 ? "out_of_attempts" : "can_retry" };
}

export function attemptsLabel(status: QuizStatus): string {
  if (status.attemptsAllowed === null) {
    return "Unlimited attempts";
  }
  const left = status.attemptsLeft ?? 0;
  return `${left} of ${status.attemptsAllowed} ${status.attemptsAllowed === 1 ? "attempt" : "attempts"} left`;
}

export function rulesLabel(passPercent: number, maxAttempts: number | null): string {
  const attempts =
    maxAttempts === null
      ? "unlimited attempts"
      : `${maxAttempts} ${maxAttempts === 1 ? "attempt" : "attempts"}`;
  return `Pass mark ${passPercent}% · ${attempts}`;
}

/** Answers given so far, by question id. */
export type Answers = Readonly<Record<string, readonly string[]>>;

/** Questions still without an answer, in order (for "confirm before submit"). */
export function unansweredQuestions(questionIds: readonly string[], answers: Answers): string[] {
  return questionIds.filter((id) => (answers[id]?.length ?? 0) === 0);
}

/** Choosing an option: single-answer kinds replace, multiple select toggles. */
export function chooseOption(
  answers: Answers,
  questionId: string,
  kind: QuestionKind,
  key: string,
): Answers {
  const current = answers[questionId] ?? [];
  const next =
    kind === "multiple"
      ? current.includes(key)
        ? current.filter((k) => k !== key)
        : [...current, key].toSorted()
      : [key];
  return { ...answers, [questionId]: next };
}

/** Only well-formed answers leave the browser: question id → option keys. */
export const answersSchema = z.record(
  z.uuid(),
  z.array(z.string().regex(/^[a-f]$/)).max(MAX_OPTIONS),
);

// ---------------------------------------------------------------------------
// Errors from the database
// ---------------------------------------------------------------------------

export type QuizError =
  | "not_authorized"
  | "quiz_already_passed"
  | "no_attempts_left"
  | "quiz_has_no_questions"
  | "no_attempts_yet"
  | "invalid_answers"
  | "unknown";

const KNOWN: ReadonlySet<string> = new Set<QuizError>([
  "not_authorized",
  "quiz_already_passed",
  "no_attempts_left",
  "quiz_has_no_questions",
  "no_attempts_yet",
  "invalid_answers",
]);

export function toQuizError(
  error: { code?: string | null; message?: string | null } | null | undefined,
): QuizError {
  if (error?.message && KNOWN.has(error.message)) {
    return error.message as QuizError;
  }
  if (error?.code === "42501") {
    return "not_authorized";
  }
  return "unknown";
}

export function quizErrorMessage(error: QuizError): string {
  switch (error) {
    case "not_authorized":
      return "This quiz is for members of the department.";
    case "quiz_already_passed":
      return "You've already passed this quiz.";
    case "no_attempts_left":
      return "You've used every attempt. Your trainer or department leader can give you another.";
    case "quiz_has_no_questions":
      return "This quiz has no questions yet.";
    case "no_attempts_yet":
      return "They haven't taken this quiz yet.";
    case "invalid_answers":
      return "Those answers couldn't be read. Refresh the page and try again.";
    case "unknown":
      return "That didn't go through. Check your connection and try again.";
  }
}
