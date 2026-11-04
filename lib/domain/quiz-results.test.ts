import { describe, expect, it } from "vitest";
import { summarizeQuizzes, triesLabel, type AttemptResult } from "./quiz-results";

const attempt = (quizKey: string, attemptNumber: number, score: number): AttemptResult => ({
  courseId: "course",
  quizKey,
  attemptNumber,
  correct: score / 10,
  total: 10,
  score,
  passed: score >= 80,
  passPercent: 80,
});

describe("summarizeQuizzes", () => {
  it("shows the best score, even when a later try was lower", () => {
    const [result] = summarizeQuizzes([attempt("q", 1, 90), attempt("q", 2, 60)]);
    expect(result?.best.score).toBe(90);
    expect(result?.passed).toBe(true);
  });
  it("keeps every try in order", () => {
    const [result] = summarizeQuizzes([attempt("q", 2, 90), attempt("q", 1, 60)]);
    expect(result?.tries.map((t) => t.attemptNumber)).toEqual([1, 2]);
  });
  it("gives each quiz its own result", () => {
    expect(summarizeQuizzes([attempt("a", 1, 70), attempt("b", 1, 90)])).toHaveLength(2);
  });
  it("a quiz not yet passed stays not passed", () => {
    expect(summarizeQuizzes([attempt("q", 1, 70)])[0]?.passed).toBe(false);
  });
  it("is empty with no attempts", () => {
    expect(summarizeQuizzes([])).toEqual([]);
  });
});

describe("triesLabel", () => {
  it("says one or many", () => {
    expect(triesLabel(1)).toBe("1 try");
    expect(triesLabel(3)).toBe("3 tries");
  });
});
