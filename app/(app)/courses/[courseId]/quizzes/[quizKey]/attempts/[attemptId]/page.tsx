import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { QuizRunner } from "@/components/quiz/quiz-runner";
import { ActionForm } from "@/components/ui/action-form";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { buttonClasses } from "@/components/ui/button";
import { ArrowRightIcon, CheckIcon, CloseIcon, InfoIcon } from "@/components/ui/icons";
import { LoadingStatus, Skeleton } from "@/components/ui/skeleton";
import { requireActiveUser } from "@/lib/data/auth";
import { getLearnerCourse } from "@/lib/data/pathway";
import {
  getAttemptQuestions,
  getAttemptReview,
  getLearnerQuiz,
  getMyAttempt,
  getMyQuizAttempts,
  type ReviewQuestion,
} from "@/lib/data/quizzes";
import { formatDate } from "@/lib/domain/dates";
import { departmentHueVar } from "@/lib/domain/departments";
import { courseSteps, stepHref } from "@/lib/domain/learning";
import { ANSWER_POLICY_LEARNER_TEXT, quizStatus } from "@/lib/domain/quiz";
import { startQuizAction, submitQuizAction } from "../../actions";

export const metadata: Metadata = { title: "Quiz" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Props = PageProps<"/courses/[courseId]/quizzes/[quizKey]/attempts/[attemptId]">;

export default function AttemptPage({ params }: Props) {
  return (
    <Suspense fallback={<AttemptSkeleton />}>
      <AttemptContent params={params} />
    </Suspense>
  );
}

/**
 * One attempt (DESIGN §6.6): the questions while it's open, then the result the system worked out
 * with the next step (continue, try again, or talk to a trainer), and the answers when the quiz's
 * policy allows (SRS-QUIZ-004..006).
 */
async function AttemptContent({ params }: Pick<Props, "params">) {
  const user = await requireActiveUser();
  const { courseId, quizKey, attemptId } = await params;
  if (!UUID.test(courseId) || !UUID.test(quizKey) || !UUID.test(attemptId)) {
    notFound();
  }
  const [attempt, course] = await Promise.all([
    getMyAttempt(user.id, attemptId),
    getLearnerCourse(courseId),
  ]);
  if (!attempt || !course || attempt.courseId !== courseId || attempt.quizKey !== quizKey) {
    notFound();
  }
  const live = await getLearnerQuiz(course.versionId, quizKey);
  const title = live?.title ?? "Quiz";
  const quizHref = `/courses/${course.id}/quizzes/${quizKey}`;
  const style = { "--dept": departmentHueVar(course.department.hue) } as CSSProperties;

  const breadcrumbs = (
    <Breadcrumbs
      items={[
        { label: "Home", href: "/home" },
        { label: course.title, href: `/courses/${course.id}` },
        { label: title, href: quizHref },
        { label: `Attempt ${attempt.attemptNumber}` },
      ]}
    />
  );

  if (attempt.submittedAt === null) {
    const questions = await getAttemptQuestions(attempt.id);
    return (
      <div style={style} className="page-container flex flex-col gap-8 py-8 lg:py-10">
        {breadcrumbs}
        <div className="flex max-w-3xl flex-col gap-8">
          <header className="flex flex-col gap-2">
            <p className="eyebrow">Attempt {attempt.attemptNumber}</p>
            <h1 className="text-title font-semibold text-balance">{title}</h1>
            <p className="text-small text-text-muted">
              {attempt.questionCount} {attempt.questionCount === 1 ? "question" : "questions"} ·
              pass mark {attempt.passPercent}%
            </p>
          </header>
          <QuizRunner questions={questions} submit={submitQuizAction.bind(null, attempt.id)} />
        </div>
      </div>
    );
  }

  const [review, mine] = await Promise.all([
    getAttemptReview(attempt.id),
    getMyQuizAttempts(user.id, course.id, quizKey),
  ]);
  const status = quizStatus(live?.maxAttempts ?? null, mine.attempts, mine.extraAttempts);
  const answersShown = review.some((question) => question.isCorrect !== null);
  const steps = courseSteps(course.modules, course.quizzes, course.practicals);
  const nextStep =
    steps[steps.findIndex((step) => step.kind === "quiz" && step.key === quizKey) + 1] ?? null;

  return (
    <div style={style} className="page-container flex flex-col gap-8 py-8 lg:py-10">
      {breadcrumbs}
      <div className="flex max-w-3xl flex-col gap-8">
        <header className="flex flex-col gap-2">
          <p className="eyebrow">
            Attempt {attempt.attemptNumber}
            {attempt.submittedAt ? ` · ${formatDate(attempt.submittedAt)}` : ""}
          </p>
          <h1 className="text-title font-semibold text-balance">{title}</h1>
        </header>

        <section
          aria-labelledby="result-heading"
          className="flex flex-col gap-4 rounded-card border border-border bg-card p-5"
        >
          <h2 id="result-heading" className="flex items-center gap-2 text-heading font-semibold">
            {attempt.passed ? (
              <CheckIcon className="size-6 text-success" />
            ) : (
              <InfoIcon className="size-6 text-text-muted" />
            )}
            {attempt.passed ? "You passed" : "Not passed this time"}
          </h2>
          <p className="text-lead">
            You scored {attempt.scorePercent}%: {attempt.correctCount} of {attempt.questionCount}{" "}
            correct. The pass mark is {attempt.passPercent}%.
          </p>

          {attempt.passed ? (
            <div className="flex flex-wrap gap-3">
              {nextStep ? (
                <Link
                  href={stepHref(course.id, nextStep)}
                  className={buttonClasses("primary", "w-fit")}
                >
                  <span className="sr-only">Next: </span>
                  {nextStep.title}
                  <ArrowRightIcon className="size-4" />
                </Link>
              ) : null}
              <Link
                href={`/courses/${course.id}`}
                className={buttonClasses(nextStep ? "secondary" : "primary", "w-fit")}
              >
                Back to the course
              </Link>
            </div>
          ) : status.state === "passed" ? (
            <Link href={`/courses/${course.id}`} className={buttonClasses("primary", "w-fit")}>
              Back to the course
            </Link>
          ) : status.state === "out_of_attempts" ? (
            <>
              <p className="text-text-secondary">
                That was your last attempt. Go back over the lessons, then talk to your trainer or
                {` ${course.department.name}`} leader: they can go through it with you and give you
                another attempt.
              </p>
              <Link href={`/courses/${course.id}`} className={buttonClasses("secondary", "w-fit")}>
                Review the lessons
              </Link>
            </>
          ) : (
            <>
              <p className="text-text-secondary">
                {status.attemptsLeft === null
                  ? "You can try again whenever you're ready."
                  : `You have ${status.attemptsLeft} ${status.attemptsLeft === 1 ? "attempt" : "attempts"} left.`}{" "}
                It can help to go back over the lessons first.
              </p>
              <div className="flex flex-wrap gap-3">
                {live ? (
                  <ActionForm
                    action={startQuizAction}
                    submitLabel="Try again"
                    pendingLabel="Starting…"
                    hidden={{ courseId: course.id, quizKey }}
                    className="flex"
                  />
                ) : null}
                <Link href={`/courses/${course.id}`} className={buttonClasses("secondary")}>
                  Review the lessons
                </Link>
              </div>
            </>
          )}
        </section>

        <section aria-labelledby="answers-heading" className="flex flex-col gap-4">
          <h2 id="answers-heading" className="text-heading font-semibold">
            Your answers
          </h2>
          {!answersShown && live ? (
            <p className="text-small text-text-secondary">
              {ANSWER_POLICY_LEARNER_TEXT[live.answerPolicy]}
            </p>
          ) : null}
          <ol className="flex flex-col gap-4">
            {review.map((question, index) => (
              <ReviewItem key={question.id} question={question} number={index + 1} />
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}

function ReviewItem({ question, number }: { question: ReviewQuestion; number: number }) {
  return (
    <li className="flex flex-col gap-3 rounded-card border border-border p-5">
      <div className="flex flex-col gap-1">
        <p className="flex items-center gap-2 text-small text-text-muted">
          Question {number}
          {question.isCorrect === true ? (
            <span className="flex items-center gap-1 text-success">
              <CheckIcon className="size-4" />
              Correct
            </span>
          ) : question.isCorrect === false ? (
            <span className="flex items-center gap-1 text-error">
              <CloseIcon className="size-4" />
              Not correct
            </span>
          ) : null}
        </p>
        {question.scenario ? (
          <p className="whitespace-pre-line text-text-secondary">{question.scenario}</p>
        ) : null}
        <p className="font-medium">{question.prompt}</p>
      </div>
      <ul className="flex flex-col gap-1.5">
        {question.options.map((option) => {
          const chosen = question.selected.includes(option.key);
          return (
            <li key={option.key} className="flex flex-wrap items-baseline gap-x-2 text-small">
              <span className={chosen ? "font-medium text-text" : "text-text-secondary"}>
                {option.label}
              </span>
              {chosen ? <span className="text-text-muted">(your answer)</span> : null}
              {option.correct === true ? (
                <span className="text-success">(correct answer)</span>
              ) : null}
            </li>
          );
        })}
      </ul>
      {question.selected.length === 0 ? (
        <p className="text-small text-text-muted">You didn&apos;t answer this one.</p>
      ) : null}
      {question.explanation ? (
        <p className="text-small text-text-secondary">{question.explanation}</p>
      ) : null}
    </li>
  );
}

function AttemptSkeleton() {
  return (
    <div className="page-container flex flex-col gap-8 py-8 lg:py-10" aria-busy="true">
      <LoadingStatus label="Loading the quiz…" />
      <Skeleton className="h-4 w-72 max-w-full" />
      <Skeleton className="h-10 w-96 max-w-full" />
      <Skeleton className="h-64 max-w-3xl" />
    </div>
  );
}
