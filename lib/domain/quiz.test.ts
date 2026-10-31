import { describe, expect, it } from "vitest";
import {
  answersSchema,
  attemptsLabel,
  chooseOption,
  questionSchema,
  quizSettingsSchema,
  quizStatus,
  rulesLabel,
  toQuizError,
  unansweredQuestions,
  type AttemptSummary,
} from "./quiz";

const attempt = (n: number, overrides: Partial<AttemptSummary> = {}): AttemptSummary => ({
  id: `attempt-${n}`,
  attemptNumber: n,
  startedAt: `2026-10-2${n}T10:00:00Z`,
  submittedAt: `2026-10-2${n}T10:10:00Z`,
  scorePercent: 50,
  passed: false,
  ...overrides,
});

const question = (overrides: Record<string, unknown> = {}) => ({
  kind: "single",
  prompt: "Which button cuts to the preview shot?",
  scenario: "",
  explanation: "",
  options: [
    { label: "Cut", correct: true },
    { label: "Auto", correct: false },
    { label: "", correct: false },
  ],
  ...overrides,
});

describe("questionSchema", () => {
  it("drops blank answers and keys the rest a, b, c…", () => {
    expect(questionSchema.parse(question()).options).toEqual([
      { key: "a", label: "Cut", correct: true },
      { key: "b", label: "Auto", correct: false },
    ]);
  });

  it("needs exactly one correct answer for single choice", () => {
    const none = questionSchema.safeParse(
      question({
        options: [
          { label: "Cut", correct: false },
          { label: "Auto", correct: false },
        ],
      }),
    );
    expect(none.error?.issues[0]?.message).toBe("Mark exactly one answer as correct.");
    const two = questionSchema.safeParse(
      question({
        options: [
          { label: "Cut", correct: true },
          { label: "Auto", correct: true },
        ],
      }),
    );
    expect(two.success).toBe(false);
  });

  it("allows several correct answers for multiple select", () => {
    const parsed = questionSchema.parse(
      question({
        kind: "multiple",
        options: [
          { label: "Headroom", correct: true },
          { label: "Lead room", correct: true },
          { label: "Zoom speed", correct: false },
        ],
      }),
    );
    expect(parsed.options.filter((o) => o.correct)).toHaveLength(2);
  });

  it("needs at least two answers", () => {
    const result = questionSchema.safeParse(
      question({ options: [{ label: "Cut", correct: true }] }),
    );
    expect(result.error?.issues[0]?.message).toBe("Give at least two answers to choose from.");
  });

  it("builds true/false options from the chosen answer", () => {
    expect(
      questionSchema.parse(question({ kind: "true_false", options: [], trueFalseAnswer: "false" }))
        .options,
    ).toEqual([
      { key: "a", label: "True", correct: false },
      { key: "b", label: "False", correct: true },
    ]);
    expect(questionSchema.safeParse(question({ kind: "true_false", options: [] })).success).toBe(
      false,
    );
  });

  it("needs a situation for a scenario, and keeps it only for scenarios", () => {
    expect(questionSchema.safeParse(question({ kind: "scenario" })).success).toBe(false);
    expect(
      questionSchema.parse(question({ kind: "scenario", scenario: "The pastor walks off stage." }))
        .scenario,
    ).toBe("The pastor walks off stage.");
    expect(questionSchema.parse(question({ scenario: "Ignored" })).scenario).toBe("");
  });
});

describe("quizSettingsSchema", () => {
  const base = {
    title: "Module check",
    intro: "",
    placement: "end",
    passPercent: "80",
    maxAttempts: "3",
    answerPolicy: "after_final_attempt",
    shuffleQuestions: false,
    isRequired: true,
  };

  it("reads numbers and unlimited attempts", () => {
    expect(quizSettingsSchema.parse(base).maxAttempts).toBe(3);
    expect(quizSettingsSchema.parse({ ...base, maxAttempts: "unlimited" }).maxAttempts).toBeNull();
  });

  it("keeps the pass mark between 1 and 100", () => {
    expect(quizSettingsSchema.safeParse({ ...base, passPercent: "0" }).success).toBe(false);
    expect(quizSettingsSchema.safeParse({ ...base, passPercent: "101" }).success).toBe(false);
  });

  it("places a quiz after a module by its key", () => {
    const key = "b7ba9dae-cab5-43e0-a996-8ae9d2436855";
    expect(quizSettingsSchema.parse({ ...base, placement: key }).placement).toBe(key);
    expect(quizSettingsSchema.safeParse({ ...base, placement: "module 1" }).success).toBe(false);
  });
});

describe("quizStatus", () => {
  it("is not started with no attempts", () => {
    const status = quizStatus(3, []);
    expect(status.state).toBe("not_started");
    expect(attemptsLabel(status)).toBe("3 of 3 attempts left");
  });

  it("is in progress while an attempt is open", () => {
    const status = quizStatus(3, [
      attempt(1),
      attempt(2, { submittedAt: null, scorePercent: null, passed: null }),
    ]);
    expect(status.state).toBe("in_progress");
    expect(status.openAttemptId).toBe("attempt-2");
    expect(status.attemptsLeft).toBe(1);
  });

  it("offers a retry until the attempts run out, then points to coaching", () => {
    expect(quizStatus(3, [attempt(1), attempt(2)]).state).toBe("can_retry");
    const out = quizStatus(3, [attempt(1), attempt(2), attempt(3)]);
    expect(out.state).toBe("out_of_attempts");
    expect(attemptsLabel(out)).toBe("0 of 3 attempts left");
  });

  it("counts extra attempts a trainer gave", () => {
    const status = quizStatus(3, [attempt(1), attempt(2), attempt(3)], 1);
    expect(status.state).toBe("can_retry");
    expect(status.attemptsLeft).toBe(1);
  });

  it("is passed after any passing attempt, and remembers the first pass and best score", () => {
    const status = quizStatus(3, [
      attempt(1),
      attempt(2, { passed: true, scorePercent: 80 }),
      attempt(3, { passed: true, scorePercent: 90 }),
    ]);
    expect(status.state).toBe("passed");
    expect(status.passedAt).toBe("2026-10-22T10:10:00Z");
    expect(status.bestScore).toBe(90);
  });

  it("never runs out with unlimited attempts", () => {
    const status = quizStatus(null, [attempt(1), attempt(2), attempt(3), attempt(4)]);
    expect(status.state).toBe("can_retry");
    expect(attemptsLabel(status)).toBe("Unlimited attempts");
  });
});

describe("rulesLabel", () => {
  it("states the pass mark and attempts", () => {
    expect(rulesLabel(80, 3)).toBe("Pass mark 80% · 3 attempts");
    expect(rulesLabel(100, 1)).toBe("Pass mark 100% · 1 attempt");
    expect(rulesLabel(70, null)).toBe("Pass mark 70% · unlimited attempts");
  });
});

describe("answers", () => {
  it("replaces the choice for single answers and toggles for multiple select", () => {
    let answers = chooseOption({}, "q1", "single", "a");
    answers = chooseOption(answers, "q1", "single", "b");
    expect(answers.q1).toEqual(["b"]);
    answers = chooseOption(answers, "q2", "multiple", "c");
    answers = chooseOption(answers, "q2", "multiple", "a");
    expect(answers.q2).toEqual(["a", "c"]);
    answers = chooseOption(answers, "q2", "multiple", "c");
    expect(answers.q2).toEqual(["a"]);
  });

  it("lists unanswered questions in order", () => {
    expect(unansweredQuestions(["q1", "q2", "q3"], { q1: ["a"], q2: [] })).toEqual(["q2", "q3"]);
  });

  it("accepts only question ids and option keys", () => {
    const id = "b7ba9dae-cab5-43e0-a996-8ae9d2436855";
    expect(answersSchema.safeParse({ [id]: ["a", "f"] }).success).toBe(true);
    expect(answersSchema.safeParse({ [id]: ["z"] }).success).toBe(false);
    expect(answersSchema.safeParse({ "not-an-id": ["a"] }).success).toBe(false);
  });
});

describe("toQuizError", () => {
  it("maps named errors and hides the rest", () => {
    expect(toQuizError({ message: "no_attempts_left" })).toBe("no_attempts_left");
    expect(toQuizError({ code: "42501", message: "permission denied" })).toBe("not_authorized");
    expect(toQuizError({ code: "XX000", message: "secret" })).toBe("unknown");
  });
});
