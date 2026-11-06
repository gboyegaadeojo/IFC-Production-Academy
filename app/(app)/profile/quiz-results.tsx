import type { CSSProperties } from "react";
import Link from "next/link";
import { DepartmentIcon } from "@/components/department-icon";
import { buttonClasses } from "@/components/ui/button";
import { ChevronDownIcon } from "@/components/ui/icons";
import { StatusBadge } from "@/components/ui/status-badge";
import type { MyQuiz } from "@/lib/data/quiz-results";
import { departmentHueVar } from "@/lib/domain/departments";
import { triesLabel } from "@/lib/domain/quiz-results";

/**
 * Your results (approved mock, Design B, 2026-11-04; ADD-REPORT-02): what you've passed, the next
 * quiz to work on, and each quiz's best score against its pass mark. "Not yet" has no penalty, and
 * none of this decides whether someone serves.
 */
export function QuizResults({
  quizzes,
  lessonsComplete,
  showTotals = true,
}: {
  quizzes: MyQuiz[];
  lessonsComplete: number;
  /** The profile shows its own totals above (mock 5), so it leaves these out. */
  showTotals?: boolean;
}) {
  const passed = quizzes.filter((quiz) => quiz.passed).length;
  const next = quizzes.find((quiz) => !quiz.passed);
  return (
    <section aria-label="Your results" className="flex flex-col gap-4">
      {showTotals ? (
        <div className="grid grid-cols-2 gap-2.5">
          <div className="flex flex-col gap-0.5 rounded-card border border-border bg-surface px-4 py-3.5">
            <span className="text-small text-text-muted">Quizzes passed</span>
            <span className="tabular text-title font-bold">
              {passed} of {quizzes.length}
            </span>
          </div>
          <div className="flex flex-col gap-0.5 rounded-card border border-border bg-surface px-4 py-3.5">
            <span className="text-small text-text-muted">Lessons complete</span>
            <span className="tabular text-title font-bold">{lessonsComplete}</span>
          </div>
        </div>
      ) : null}
      {next ? (
        <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2.5 rounded-card border border-warning-line bg-warning-soft px-3.5 py-3">
          <div className="flex min-w-52 flex-1 flex-col gap-0.5">
            <span className="font-semibold text-text">Next to work on: {next.courseTitle}</span>
            <span className="text-small text-text-secondary">
              You&apos;re at {next.best.score}%. The pass mark is {next.best.passPercent}%, and
              there&apos;s no penalty for trying again.
            </span>
          </div>
          <Link
            href={`/courses/${next.courseId}/quizzes/${next.quizKey}`}
            className={buttonClasses("secondary")}
          >
            Try again<span className="sr-only">: {next.quizTitle}</span>
          </Link>
        </div>
      ) : null}
      <div className="flex flex-col gap-3">
        <h2 className="text-heading font-semibold">Your quizzes</h2>
        {quizzes.length === 0 ? (
          <p className="rounded-card border border-border bg-surface px-4 py-3.5 text-small text-text-secondary">
            None yet. When you finish a quiz, your best score shows here.
          </p>
        ) : (
          <ul className="grid items-start gap-2.5 md:grid-cols-2">
            {quizzes.map((quiz) => (
              <li key={`${quiz.courseId}:${quiz.quizKey}`}>
                <QuizCard quiz={quiz} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function QuizCard({ quiz }: { quiz: MyQuiz }) {
  const { best } = quiz;
  const style = { "--dept": departmentHueVar(quiz.hue) } as CSSProperties;
  return (
    <details
      style={style}
      className="group lift rounded-card border border-border bg-surface [&_summary::-webkit-details-marker]:hidden"
    >
      <summary className="grid cursor-pointer list-none grid-cols-[auto_minmax(0,1fr)] gap-3 rounded-card p-3">
        <span
          aria-hidden="true"
          className="flex aspect-[3/4] w-14 items-center justify-center overflow-hidden rounded-button border border-[color-mix(in_srgb,var(--dept)_35%,var(--border))] bg-[linear-gradient(165deg,color-mix(in_srgb,var(--dept)_32%,var(--surface)),color-mix(in_srgb,var(--dept)_8%,var(--surface)))] text-[var(--dept)]"
        >
          {quiz.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={quiz.coverUrl} alt="" loading="lazy" className="size-full object-cover" />
          ) : (
            <DepartmentIcon icon={quiz.icon} className="size-5" />
          )}
        </span>
        <span className="flex min-w-0 flex-col gap-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="font-semibold">{quiz.courseTitle}</span>
            <span className="tabular text-heading font-bold">{best.score}%</span>
          </span>
          <span className="text-small text-text-muted">
            {quiz.quizTitle} · {best.correct} of {best.total} correct
          </span>
          {/* The line marks the pass mark, so the score reads against it, not against 100. */}
          <span aria-hidden="true" className="relative mt-1 h-1.5 rounded-pill bg-border">
            <span
              className={`absolute inset-y-0 left-0 rounded-pill ${quiz.passed ? "bg-success" : "bg-warning"}`}
              style={{ width: `${best.score}%` }}
            />
            <span
              className="absolute -inset-y-1 w-0.5 rounded-pill bg-text-secondary"
              style={{ left: `${best.passPercent}%` }}
            />
          </span>
          <span className="mt-1.5 flex items-center justify-between gap-2">
            <StatusBadge tone={quiz.passed ? "success" : "pending"}>
              {quiz.passed ? "Passed" : "Not yet"}
            </StatusBadge>
            <span className="flex items-center gap-1 text-small text-text-muted">
              {triesLabel(quiz.tries.length)}
              <ChevronDownIcon className="size-4 transition-surface group-open:rotate-180" />
            </span>
          </span>
        </span>
      </summary>
      <ol className="tabular flex flex-col gap-0.5 px-3 pb-3 text-small text-text-secondary">
        {quiz.tries.map((attempt) => (
          <li key={attempt.attemptNumber}>
            Try {attempt.attemptNumber}: {attempt.score}%{attempt.passed ? " · Passed" : ""}
          </li>
        ))}
      </ol>
    </details>
  );
}
