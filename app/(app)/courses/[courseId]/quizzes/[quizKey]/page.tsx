import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { ActionForm } from "@/components/ui/action-form";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { buttonClasses } from "@/components/ui/button";
import { ArrowRightIcon, CheckIcon } from "@/components/ui/icons";
import { LoadingStatus, Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireActiveUser } from "@/lib/data/auth";
import { getLearnerCourse, canLearnIn } from "@/lib/data/pathway";
import { getLearnerQuiz, getMyQuizAttempts } from "@/lib/data/quizzes";
import { formatDate } from "@/lib/domain/dates";
import { departmentHueVar } from "@/lib/domain/departments";
import {
  ANSWER_POLICY_LEARNER_TEXT,
  attemptsLabel,
  quizStatus,
  rulesLabel,
} from "@/lib/domain/quiz";
import { startQuizAction } from "./actions";

export const metadata: Metadata = { title: "Quiz" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Props = PageProps<"/courses/[courseId]/quizzes/[quizKey]">;

export default function QuizPage({ params }: Props) {
  return (
    <Suspense fallback={<QuizSkeleton />}>
      <QuizContent params={params} />
    </Suspense>
  );
}

/**
 * Quiz overview (DESIGN §6.6): the rules before starting, where the learner stands, and their past
 * attempts. The system scores every attempt (SRS-QUIZ-002..005); passing counts towards finishing
 * the course and never approves anyone to serve (SPEC §3).
 */
async function QuizContent({ params }: Pick<Props, "params">) {
  const user = await requireActiveUser();
  const { courseId, quizKey } = await params;
  if (!UUID.test(courseId) || !UUID.test(quizKey)) {
    notFound();
  }
  const course = await getLearnerCourse(courseId);
  if (!course) {
    notFound();
  }
  if (!course.canOpen) {
    redirect(`/courses/${course.id}`);
  }
  const placed = course.quizzes.find((quiz) => quiz.key === quizKey);
  const [quiz, member] = placed
    ? await Promise.all([
        getLearnerQuiz(course.versionId, quizKey),
        canLearnIn(user.id, course.department.id),
      ])
    : [null, false];
  if (!placed || !quiz) {
    notFound();
  }
  const { attempts, extraAttempts } = member
    ? await getMyQuizAttempts(user.id, course.id, quizKey)
    : { attempts: [], extraAttempts: 0 };
  const status = quizStatus(quiz.maxAttempts, attempts, extraAttempts);
  const moduleTitle = course.modules.find((m) => m.id === placed.afterModuleId)?.title;
  const style = { "--dept": departmentHueVar(course.department.hue) } as CSSProperties;
  const attemptHref = (id: string) => `/courses/${course.id}/quizzes/${quizKey}/attempts/${id}`;
  const submitted = attempts.filter((attempt) => attempt.submittedAt !== null).toReversed();

  return (
    <div style={style} className="page-container flex flex-col gap-8 py-8 lg:py-10">
      <Breadcrumbs
        items={[
          { label: "Home", href: "/home" },
          { label: course.department.name, href: `/departments/${course.department.slug}` },
          { label: course.title, href: `/courses/${course.id}` },
          { label: quiz.title },
        ]}
      />
      <div className="flex reading-width flex-col gap-8">
        <header className="flex flex-col gap-3 border-l-2 border-[var(--dept)] pl-5">
          <p className="eyebrow">
            Quiz{moduleTitle ? ` · after ${moduleTitle}` : " · end of the course"}
          </p>
          <h1 className="text-title font-semibold text-balance">{quiz.title}</h1>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-small text-text-muted">
            <li>{rulesLabel(quiz.passPercent, quiz.maxAttempts)}</li>
            <li>{quiz.isRequired ? "Required to finish the course" : "Optional"}</li>
          </ul>
          {quiz.intro ? (
            <p className="text-lead whitespace-pre-line text-text-secondary">{quiz.intro}</p>
          ) : null}
        </header>

        <section
          aria-labelledby="quiz-status-heading"
          className="flex flex-col gap-4 rounded-card border border-border bg-card p-5"
        >
          <h2 id="quiz-status-heading" className="font-medium">
            {status.state === "passed" ? "You passed this quiz" : "Your attempts"}
          </h2>
          {!member ? (
            <p className="text-small text-text-muted">
              Quizzes are taken by members of {course.department.name}. You&apos;re seeing this as
              someone who looks after its training.
            </p>
          ) : status.state === "passed" ? (
            <>
              <p className="flex items-center gap-2">
                <CheckIcon className="size-5 text-success" />
                Passed{status.passedAt ? ` on ${formatDate(status.passedAt)}` : ""}
                {status.bestScore !== null ? `, best score ${status.bestScore}%` : ""}.
              </p>
              <Link href={`/courses/${course.id}`} className={buttonClasses("primary", "w-fit")}>
                Back to the course
                <ArrowRightIcon className="size-4" />
              </Link>
            </>
          ) : status.state === "in_progress" && status.openAttemptId ? (
            <>
              <p className="text-text-secondary">
                You have an attempt in progress. Pick up where you left off.
              </p>
              <Link
                href={attemptHref(status.openAttemptId)}
                className={buttonClasses("primary", "w-fit")}
              >
                Resume the quiz
                <ArrowRightIcon className="size-4" />
              </Link>
            </>
          ) : status.state === "out_of_attempts" ? (
            <>
              <p className="text-text-secondary">
                You&apos;ve used all {status.attemptsAllowed} attempts. Go back over the lessons,
                then talk to your trainer or {course.department.name} leader: they can go through it
                with you and give you another attempt.
              </p>
              <Link href={`/courses/${course.id}`} className={buttonClasses("secondary", "w-fit")}>
                Review the lessons
              </Link>
            </>
          ) : (
            <>
              <p className="text-text-secondary">
                {attemptsLabel(status)}. {ANSWER_POLICY_LEARNER_TEXT[quiz.answerPolicy]}
              </p>
              <ActionForm
                action={startQuizAction}
                submitLabel={status.state === "can_retry" ? "Try again" : "Start the quiz"}
                pendingLabel="Starting…"
                hidden={{ courseId: course.id, quizKey }}
              />
            </>
          )}
        </section>

        {submitted.length > 0 ? (
          <section aria-labelledby="past-attempts-heading" className="flex flex-col gap-3">
            <h2 id="past-attempts-heading" className="text-heading font-semibold">
              Past attempts
            </h2>
            <ol className="flex flex-col divide-y divide-border rounded-card border border-border">
              {submitted.map((attempt) => (
                <li key={attempt.id}>
                  <Link
                    href={attemptHref(attempt.id)}
                    className="flex min-h-touch flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-card"
                  >
                    <span className="flex flex-col">
                      <span className="font-medium">
                        Attempt {attempt.attemptNumber}: {attempt.scorePercent}%
                      </span>
                      <span className="text-small text-text-muted">
                        {attempt.submittedAt ? formatDate(attempt.submittedAt) : ""}
                      </span>
                    </span>
                    <StatusBadge tone={attempt.passed ? "success" : "neutral"}>
                      {attempt.passed ? "Passed" : "Not passed"}
                    </StatusBadge>
                  </Link>
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        <p className="text-small text-text-muted">
          The app scores your answers against the pass mark the department set. Passing counts
          towards finishing the course. It doesn&apos;t approve you to serve: that comes from
          practical assessments with a trainer.
        </p>
      </div>
    </div>
  );
}

function QuizSkeleton() {
  return (
    <div className="page-container flex flex-col gap-8 py-8 lg:py-10" aria-busy="true">
      <LoadingStatus label="Loading the quiz…" />
      <Skeleton className="h-4 w-72 max-w-full" />
      <Skeleton className="h-10 w-96 max-w-full" />
      <Skeleton className="h-40 max-w-2xl" />
    </div>
  );
}
