/**
 * Quiz results for Profile and Reports (ADD-REPORT-02). People can retake a quiz, so the best score
 * is the one shown (G, 2026-11-04). A result never decides whether someone serves.
 */

export type AttemptResult = {
  courseId: string;
  quizKey: string;
  attemptNumber: number;
  correct: number;
  total: number;
  score: number;
  passed: boolean;
  passPercent: number;
};

export type QuizResult = {
  courseId: string;
  quizKey: string;
  best: AttemptResult;
  passed: boolean;
  /** Every try, first to last. */
  tries: AttemptResult[];
};

/** One result per quiz, from its submitted attempts, in the order the quizzes were first taken. */
export function summarizeQuizzes(attempts: readonly AttemptResult[]): QuizResult[] {
  const groups = new Map<string, AttemptResult[]>();
  for (const attempt of attempts) {
    const key = `${attempt.courseId}:${attempt.quizKey}`;
    groups.set(key, [...(groups.get(key) ?? []), attempt]);
  }
  return [...groups.values()].flatMap((group) => {
    const tries = group.toSorted((a, b) => a.attemptNumber - b.attemptNumber);
    const best = tries.reduce<AttemptResult | undefined>(
      (top, attempt) => (!top || attempt.score > top.score ? attempt : top),
      undefined,
    );
    return best
      ? [
          {
            courseId: best.courseId,
            quizKey: best.quizKey,
            best,
            passed: tries.some((attempt) => attempt.passed),
            tries,
          },
        ]
      : [];
  });
}

export function triesLabel(count: number): string {
  return count === 1 ? "1 try" : `${count} tries`;
}
