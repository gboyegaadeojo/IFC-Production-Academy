import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ActionForm, Field, fieldClasses } from "@/components/ui/action-form";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { getAdminAccess } from "@/lib/data/admin/access";
import { getQuizEditor, getQuizResults, type QuizEditor } from "@/lib/data/quizzes";
import { formatDateTime } from "@/lib/domain/admin";
import { hasCapability } from "@/lib/domain/capabilities";
import {
  ANSWER_POLICIES,
  ANSWER_POLICY_LABELS,
  DEFAULT_MAX_ATTEMPTS,
  MAX_QUESTIONS,
  QUESTION_KIND_LABELS,
  attemptsLabel,
  rulesLabel,
} from "@/lib/domain/quiz";
import { AccessDenied } from "../../../../access-denied";
import { PageSkeleton } from "../../../../page-skeleton";
import {
  deleteQuestionAction,
  deleteQuizAction,
  grantAttemptAction,
  moveQuestionAction,
  updateQuizAction,
} from "../../../quiz-actions";

export const metadata: Metadata = { title: "Quiz" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Props = PageProps<"/admin/curriculum/[courseId]/quizzes/[quizId]">;

export default function QuizEditorPage({ params }: Props) {
  return (
    <Suspense fallback={<PageSkeleton label="Loading the quiz…" />}>
      <QuizEditorContent params={params} />
    </Suspense>
  );
}

const ATTEMPT_CHOICES = ["1", "2", "3", "4", "5", "10", "unlimited"] as const;

/**
 * Quiz editor (SRS-QUIZ-001..003, -006) and results (SRS-QUIZ-004, -007). Settings and questions
 * change only in a draft; publishing makes them live with the rest of the course. Results cover
 * every version of the quiz, for people who can view the department's reports.
 */
async function QuizEditorContent({ params }: Pick<Props, "params">) {
  const { grants, allowed } = await getAdminAccess("curriculum");
  if (!allowed) {
    return <AccessDenied />;
  }
  const { courseId, quizId } = await params;
  if (!UUID.test(courseId) || !UUID.test(quizId)) {
    notFound();
  }
  const quiz = await getQuizEditor(quizId);
  if (!quiz || quiz.courseId !== courseId) {
    notFound();
  }
  const canDraft = hasCapability(grants, "course.draft", quiz.departmentId);
  const editable = quiz.editable && canDraft;
  const canViewResults = hasCapability(grants, "report.view", quiz.departmentId);
  const canGrant = hasCapability(grants, "assessment.record", quiz.departmentId);
  const results = canViewResults
    ? await getQuizResults(courseId, quiz.key, quiz.settings.maxAttempts)
    : [];
  const courseHref = `/admin/curriculum/${courseId}?tab=quizzes`;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <Breadcrumbs
          items={[
            { label: "Curriculum", href: "/admin/curriculum" },
            { label: "Course", href: courseHref },
            { label: quiz.settings.title },
          ]}
        />
        <p className="eyebrow">Quiz</p>
        <h1 className="text-title font-semibold">{quiz.settings.title}</h1>
        <div className="flex flex-wrap gap-2">
          <StatusBadge tone={editable ? "pending" : "neutral"}>
            {editable ? "In your draft" : "Read only"}
          </StatusBadge>
          <StatusBadge tone="info">
            {rulesLabel(quiz.settings.passPercent, quiz.settings.maxAttempts)}
          </StatusBadge>
        </div>
        {!editable ? (
          <p className="text-small text-text-muted">
            {canDraft
              ? "This is a published version. Choose Edit course on the course page to change it in a draft."
              : "You can see this quiz but not change it."}
          </p>
        ) : null}
      </header>

      {editable ? <SettingsForm quiz={quiz} /> : <SettingsSummary quiz={quiz} />}

      <section aria-labelledby="questions-heading" className="flex flex-col gap-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 id="questions-heading" className="text-heading font-semibold">
            Questions ({quiz.questions.length})
          </h2>
          {editable && quiz.questions.length < MAX_QUESTIONS ? (
            <Link
              href={`/admin/curriculum/${courseId}/quizzes/${quiz.id}/questions/new`}
              className={buttonClasses("secondary", "w-fit")}
            >
              Add question
            </Link>
          ) : null}
        </div>
        {quiz.questions.length === 0 ? (
          <EmptyState title="No questions yet">
            Add at least one question. A quiz without questions can&apos;t be published.
          </EmptyState>
        ) : (
          <ol className="flex flex-col divide-y divide-border rounded-card border border-border">
            {quiz.questions.map((question, index) => (
              <li key={question.id} className="flex flex-col gap-3 p-4">
                <div className="flex flex-col gap-1">
                  <p className="text-small text-text-muted">
                    {index + 1}. {QUESTION_KIND_LABELS[question.kind]}
                  </p>
                  {editable ? (
                    <Link
                      href={`/admin/curriculum/${courseId}/quizzes/${quiz.id}/questions/${question.id}`}
                      className="font-medium text-accent-light underline-offset-4 hover:underline"
                    >
                      {question.prompt}
                    </Link>
                  ) : (
                    <p className="font-medium">{question.prompt}</p>
                  )}
                  <ul className="flex flex-col gap-0.5 text-small text-text-secondary">
                    {question.options.map((option) => (
                      <li key={option.key}>
                        {option.label}
                        {option.correct ? <span className="text-success"> (correct)</span> : null}
                      </li>
                    ))}
                  </ul>
                </div>
                {editable ? (
                  <div className="flex flex-wrap gap-1">
                    {index > 0 ? (
                      <ActionForm
                        action={moveQuestionAction}
                        submitLabel="Move up"
                        pendingLabel="Moving…"
                        variant="tertiary"
                        hidden={{ questionId: question.id, direction: "up" }}
                        srLabel={`question ${index + 1}`}
                        className="flex"
                      />
                    ) : null}
                    {index < quiz.questions.length - 1 ? (
                      <ActionForm
                        action={moveQuestionAction}
                        submitLabel="Move down"
                        pendingLabel="Moving…"
                        variant="tertiary"
                        hidden={{ questionId: question.id, direction: "down" }}
                        srLabel={`question ${index + 1}`}
                        className="flex"
                      />
                    ) : null}
                    <ActionForm
                      action={deleteQuestionAction}
                      submitLabel="Remove"
                      pendingLabel="Removing…"
                      variant="tertiary"
                      hidden={{ questionId: question.id }}
                      srLabel={`question ${index + 1}`}
                      className="flex"
                    />
                  </div>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </section>

      {canViewResults ? (
        <section aria-labelledby="results-heading" className="flex flex-col gap-4">
          <h2 id="results-heading" className="text-heading font-semibold">
            Results
          </h2>
          <p className="text-small text-text-muted">
            Every attempt on any version of this quiz. The app scores them; nobody marks them by
            hand.
          </p>
          {results.length === 0 ? (
            <EmptyState title="No attempts yet">
              Results appear here once members take the published quiz.
            </EmptyState>
          ) : (
            <ul className="flex flex-col divide-y divide-border rounded-card border border-border">
              {results.map((row) => (
                <li key={row.person.id} className="flex flex-col gap-3 p-4">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex flex-col">
                      <p className="font-medium">{row.person.displayName}</p>
                      <p className="text-small text-text-muted">
                        {row.status.bestScore !== null ? `Best ${row.status.bestScore}% · ` : ""}
                        {attemptsLabel(row.status)}
                      </p>
                    </div>
                    <StatusBadge
                      tone={
                        row.status.state === "passed"
                          ? "success"
                          : row.status.state === "out_of_attempts"
                            ? "locked"
                            : "pending"
                      }
                    >
                      {row.status.state === "passed"
                        ? "Passed"
                        : row.status.state === "out_of_attempts"
                          ? "Out of attempts"
                          : row.status.state === "in_progress"
                            ? "Taking it now"
                            : "Not passed yet"}
                    </StatusBadge>
                  </div>
                  <ol className="flex flex-col gap-0.5 text-small text-text-secondary">
                    {row.attempts.map((attempt) => (
                      <li key={attempt.id}>
                        Attempt {attempt.attemptNumber}
                        {attempt.versionNumber ? ` (version ${attempt.versionNumber})` : ""}:{" "}
                        {attempt.submittedAt
                          ? `${attempt.scorePercent}%, ${attempt.passed ? "passed" : "not passed"}, ${formatDateTime(attempt.submittedAt)}`
                          : `started ${formatDateTime(attempt.startedAt)}, not submitted`}
                      </li>
                    ))}
                  </ol>
                  {canGrant && row.status.state === "out_of_attempts" ? (
                    <ActionForm
                      action={grantAttemptAction}
                      submitLabel="Give another attempt"
                      pendingLabel="Saving…"
                      variant="secondary"
                      hidden={{ userId: row.person.id, courseId, quizKey: quiz.key }}
                      srLabel={`to ${row.person.displayName}`}
                    >
                      <Field
                        id={`grant-reason-${row.person.id}`}
                        label="Note (optional)"
                        hint="For example, “Went through camera presets together”. Kept in the audit log."
                      >
                        <input
                          id={`grant-reason-${row.person.id}`}
                          name="reason"
                          maxLength={300}
                          aria-describedby={`grant-reason-${row.person.id}-hint`}
                          className={fieldClasses}
                        />
                      </Field>
                    </ActionForm>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {editable ? (
        <details className="max-w-2xl rounded-card border border-border p-5">
          <summary className="flex min-h-control cursor-pointer items-center font-medium">
            Remove this quiz
          </summary>
          <p className="mt-2 text-text-secondary">
            Removes it and its questions from the draft. Published versions and everyone&apos;s
            attempts are kept.
          </p>
          <div className="mt-3">
            <ActionForm
              action={deleteQuizAction}
              submitLabel="Remove quiz"
              pendingLabel="Removing…"
              variant="destructive"
              hidden={{ quizId: quiz.id, courseId }}
            />
          </div>
        </details>
      ) : null}
    </div>
  );
}

function placementLabel(quiz: QuizEditor): string {
  const after = quiz.modules.find((m) => m.key === quiz.settings.placement);
  return after ? `After “${after.title}”` : "At the end of the course";
}

function SettingsSummary({ quiz }: { quiz: QuizEditor }) {
  const { settings } = quiz;
  return (
    <section
      aria-labelledby="settings-heading"
      className="flex max-w-2xl flex-col gap-3 rounded-card border border-border bg-card p-5"
    >
      <h2 id="settings-heading" className="text-subheading font-semibold">
        Settings
      </h2>
      <dl className="grid gap-2 sm:grid-cols-[12rem_1fr]">
        <dt className="text-small text-text-muted">Where it sits</dt>
        <dd>{placementLabel(quiz)}</dd>
        <dt className="text-small text-text-muted">Rules</dt>
        <dd>{rulesLabel(settings.passPercent, settings.maxAttempts)}</dd>
        <dt className="text-small text-text-muted">Correct answers shown</dt>
        <dd>{ANSWER_POLICY_LABELS[settings.answerPolicy]}</dd>
        <dt className="text-small text-text-muted">Question order</dt>
        <dd>{settings.shuffleQuestions ? "Shuffled for each attempt" : "As listed"}</dd>
        <dt className="text-small text-text-muted">Finishing the course</dt>
        <dd>{settings.isRequired ? "Must be passed" : "Optional"}</dd>
      </dl>
    </section>
  );
}

function SettingsForm({ quiz }: { quiz: QuizEditor }) {
  const { settings } = quiz;
  const attempts = settings.maxAttempts === null ? "unlimited" : String(settings.maxAttempts);
  const choices: readonly string[] = ATTEMPT_CHOICES.includes(
    attempts as (typeof ATTEMPT_CHOICES)[number],
  )
    ? ATTEMPT_CHOICES
    : [...ATTEMPT_CHOICES, attempts];
  return (
    <section
      aria-labelledby="settings-heading"
      className="flex max-w-2xl flex-col gap-4 rounded-card border border-border bg-card p-5"
    >
      <h2 id="settings-heading" className="text-subheading font-semibold">
        Settings
      </h2>
      <ActionForm
        action={updateQuizAction}
        submitLabel="Save settings"
        hidden={{ quizId: quiz.id }}
      >
        <Field id="quiz-title" label="Title">
          <input
            id="quiz-title"
            name="title"
            required
            maxLength={120}
            defaultValue={settings.title}
            className={fieldClasses}
          />
        </Field>
        <Field
          id="quiz-intro"
          label="Introduction (optional)"
          hint="What it covers, shown before someone starts."
        >
          <textarea
            id="quiz-intro"
            name="intro"
            rows={3}
            maxLength={1000}
            defaultValue={settings.intro}
            aria-describedby="quiz-intro-hint"
            className={`${fieldClasses} py-3`}
          />
        </Field>
        <Field id="quiz-placement" label="Where it sits in the course">
          <select
            id="quiz-placement"
            name="placement"
            defaultValue={settings.placement}
            className={fieldClasses}
          >
            {quiz.modules.map((courseModule) => (
              <option key={courseModule.key} value={courseModule.key}>
                After “{courseModule.title}”
              </option>
            ))}
            <option value="end">At the end of the course</option>
          </select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="quiz-pass" label="Pass mark (%)" hint="The default is 80%.">
            <input
              id="quiz-pass"
              name="passPercent"
              type="number"
              inputMode="numeric"
              min={1}
              max={100}
              required
              defaultValue={settings.passPercent}
              aria-describedby="quiz-pass-hint"
              className={`${fieldClasses} w-32`}
            />
          </Field>
          <Field
            id="quiz-attempts"
            label="Attempts"
            hint={`The default is ${DEFAULT_MAX_ATTEMPTS}. A trainer can give more.`}
          >
            <select
              id="quiz-attempts"
              name="maxAttempts"
              defaultValue={attempts}
              aria-describedby="quiz-attempts-hint"
              className={`${fieldClasses} w-40`}
            >
              {choices.map((choice) => (
                <option key={choice} value={choice}>
                  {choice === "unlimited" ? "Unlimited" : choice}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field id="quiz-answers" label="When people see the correct answers">
          <select
            id="quiz-answers"
            name="answerPolicy"
            defaultValue={settings.answerPolicy}
            className={fieldClasses}
          >
            {ANSWER_POLICIES.map((policy) => (
              <option key={policy} value={policy}>
                {ANSWER_POLICY_LABELS[policy]}
              </option>
            ))}
          </select>
        </Field>
        <label className="flex min-h-control items-center gap-3">
          <input
            type="checkbox"
            name="shuffleQuestions"
            defaultChecked={settings.shuffleQuestions}
            className="size-5 accent-accent"
          />
          Shuffle the questions for each attempt
        </label>
        <label className="flex min-h-control items-center gap-3">
          <input
            type="checkbox"
            name="isRequired"
            defaultChecked={settings.isRequired}
            className="size-5 accent-accent"
          />
          Must be passed to finish the course
        </label>
      </ActionForm>
    </section>
  );
}
