import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { ActionForm } from "@/components/ui/action-form";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { buttonClasses } from "@/components/ui/button";
import { CheckIcon, DashIcon } from "@/components/ui/icons";
import { LoadingStatus, Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireActiveUser } from "@/lib/data/auth";
import { getLearnerCourse, canLearnIn } from "@/lib/data/pathway";
import { getMyPracticalStatus, getPracticalByKey } from "@/lib/data/practicals";
import { formatDate } from "@/lib/domain/dates";
import { departmentHueVar } from "@/lib/domain/departments";
import {
  nextAssessmentAt,
  OUTCOME_LABELS,
  passRuleLabel,
  PRACTICAL_STATE_LABELS,
  practicalState,
} from "@/lib/domain/practical";
import { cancelRequestAction, requestAssessmentAction } from "./actions";

export const metadata: Metadata = { title: "Practical assessment" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Props = PageProps<"/courses/[courseId]/practicals/[practicalKey]">;

export default function PracticalPage({ params }: Props) {
  return (
    <Suspense fallback={<PracticalSkeleton />}>
      <PracticalContent params={params} />
    </Suspense>
  );
}

/**
 * A practical assessment from the learner's side (SRS-ASSESS-001..007): what a trainer will watch
 * for, the pass rule, where they stand, and the feedback from each assessment. The Academy works
 * out the result from what the trainer observed; passing grants the competency, which is what
 * counts towards serving (SPEC §3).
 */
async function PracticalContent({ params }: Pick<Props, "params">) {
  const user = await requireActiveUser();
  const { courseId, practicalKey } = await params;
  if (!UUID.test(courseId) || !UUID.test(practicalKey)) {
    notFound();
  }
  const course = await getLearnerCourse(courseId);
  if (!course) {
    notFound();
  }
  if (!course.canOpen) {
    redirect(`/courses/${course.id}`);
  }
  const placed = course.practicals.find((p) => p.key === practicalKey);
  const [practical, member] = placed
    ? await Promise.all([
        getPracticalByKey(course.versionId, practicalKey),
        canLearnIn(user.id, course.department.id),
      ])
    : [null, false];
  if (!placed || !practical) {
    notFound();
  }
  const { assessments, openRequestId } = member
    ? await getMyPracticalStatus(user.id, course.id, practicalKey)
    : { assessments: [], openRequestId: null };
  const state = practicalState(assessments, openRequestId !== null);
  const latest = assessments.find((a) => a.voidedAt === null) ?? null;
  const now = new Date();
  const waitUntil =
    latest?.outcome === "further_practice"
      ? nextAssessmentAt(latest.assessedAt, practical.retryWaitDays)
      : null;
  const style = { "--dept": departmentHueVar(course.department.hue) } as CSSProperties;
  const moduleTitle = course.modules.find((m) => m.id === placed.afterModuleId)?.title;
  const rule = {
    requireAllRequired: practical.requireAllRequired,
    passMinPercent: practical.passMinPercent,
  };

  return (
    <div style={style} className="page-container flex flex-col gap-8 py-8 lg:py-10">
      <Breadcrumbs
        items={[
          { label: "Home", href: "/home" },
          { label: course.department.name, href: `/departments/${course.department.slug}` },
          { label: course.title, href: `/courses/${course.id}` },
          { label: practical.title },
        ]}
      />
      <div className="flex reading-width flex-col gap-8">
        <header className="flex flex-col gap-3 border-l-2 border-[var(--dept)] pl-5">
          <p className="eyebrow">
            Practical assessment{moduleTitle ? ` · after ${moduleTitle}` : " · end of the course"}
          </p>
          <h1 className="text-title font-semibold text-balance">{practical.title}</h1>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-small text-text-muted">
            <li>{practical.isRequired ? "Required to finish the course" : "Optional"}</li>
            {practical.competency ? <li>Grants: {practical.competency.name}</li> : null}
          </ul>
          {practical.intro ? (
            <p className="text-lead whitespace-pre-line text-text-secondary">{practical.intro}</p>
          ) : null}
        </header>

        <section
          aria-labelledby="practical-status-heading"
          className="flex flex-col gap-4 rounded-card border border-border bg-card p-5"
        >
          <div className="flex flex-wrap items-center gap-3">
            <h2 id="practical-status-heading" className="font-medium">
              Where you are
            </h2>
            {member ? (
              <StatusBadge tone={state === "passed" ? "success" : "pending"}>
                {PRACTICAL_STATE_LABELS[state]}
              </StatusBadge>
            ) : null}
          </div>
          {!member ? (
            <p className="text-small text-text-muted">
              Practical assessments are for members of {course.department.name}. You&apos;re seeing
              this as someone who looks after its training.
            </p>
          ) : state === "passed" ? (
            <p className="text-text-secondary">
              You passed
              {latest ? ` on ${formatDate(latest.assessedAt)}` : ""}.
              {practical.competency
                ? ` ${practical.competency.name} is now one of your approved competencies.`
                : ""}{" "}
              <Link
                href={`/departments/${course.department.slug}`}
                className="text-accent-light underline-offset-4 hover:underline"
              >
                See what you&apos;re approved to serve in
              </Link>
              .
            </p>
          ) : state === "requested" && openRequestId ? (
            <>
              <p className="text-text-secondary">
                You&apos;ve asked to be assessed. A trainer will arrange a time with you, usually at
                a rehearsal or before a service.
              </p>
              <ActionForm
                action={cancelRequestAction}
                submitLabel="Withdraw my request"
                pendingLabel="Withdrawing…"
                variant="secondary"
                hidden={{ requestId: openRequestId }}
              />
            </>
          ) : (
            <>
              <p className="text-text-secondary">
                {state === "further_practice"
                  ? "Not yet, and that's fine. Everyone learns at their own pace. Keep practising the items below, then ask to be assessed again whenever you're ready."
                  : "When you're comfortable with everything below, ask a trainer to watch you work."}
                {waitUntil && waitUntil.getTime() > now.getTime()
                  ? ` The next assessment can be from ${formatDate(waitUntil.toISOString())}.`
                  : ""}
              </p>
              <ActionForm
                action={requestAssessmentAction}
                submitLabel="Request assessment"
                pendingLabel="Sending…"
                hidden={{ courseId: course.id, practicalKey }}
              />
            </>
          )}
        </section>

        <section aria-labelledby="criteria-heading" className="flex flex-col gap-3">
          <h2 id="criteria-heading" className="text-heading font-semibold">
            What the trainer watches for
          </h2>
          <p className="text-small text-text-secondary">{passRuleLabel(rule)}.</p>
          <ol className="flex flex-col divide-y divide-border rounded-card border border-border">
            {practical.criteria.map((criterion) => {
              const seen = latest?.observedIds.includes(criterion.id) ?? false;
              return (
                <li key={criterion.id} className="flex gap-3 p-4">
                  {latest ? (
                    <span
                      className={`mt-0.5 shrink-0 ${seen ? "text-success" : "text-text-muted"}`}
                    >
                      {seen ? <CheckIcon className="size-5" /> : <DashIcon className="size-5" />}
                      <span className="sr-only">
                        {seen ? "Observed last time: " : "Not observed last time: "}
                      </span>
                    </span>
                  ) : null}
                  <span className="flex flex-col gap-0.5">
                    <span className="font-medium">
                      {criterion.label}
                      <span className="font-normal text-text-muted">
                        {criterion.isRequired ? " (required)" : " (optional)"}
                      </span>
                    </span>
                    {criterion.description ? (
                      <span className="text-small text-text-secondary">
                        {criterion.description}
                      </span>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ol>
        </section>

        {assessments.length > 0 ? (
          <section aria-labelledby="feedback-heading" className="flex flex-col gap-3">
            <h2 id="feedback-heading" className="text-heading font-semibold">
              Your assessments
            </h2>
            <ol className="flex flex-col gap-3">
              {assessments.map((assessment) => (
                <li
                  key={assessment.id}
                  className="flex flex-col gap-2 rounded-card border border-border p-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{formatDate(assessment.assessedAt)}</span>
                    <StatusBadge
                      tone={
                        assessment.voidedAt
                          ? "neutral"
                          : assessment.outcome === "pass"
                            ? "success"
                            : "pending"
                      }
                    >
                      {assessment.voidedAt ? "Withdrawn" : OUTCOME_LABELS[assessment.outcome]}
                    </StatusBadge>
                  </div>
                  <p className="text-small text-text-muted">
                    Observed by {assessment.observerName} · {assessment.observedCount} of{" "}
                    {assessment.criteriaCount} items seen, {assessment.requiredObserved} of{" "}
                    {assessment.requiredCount} required
                  </p>
                  {assessment.feedback ? (
                    <p className="whitespace-pre-line text-text-secondary">{assessment.feedback}</p>
                  ) : null}
                  {assessment.voidReason ? (
                    <p className="text-small text-text-muted">
                      A leader withdrew this assessment: {assessment.voidReason}
                    </p>
                  ) : null}
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        <Link href={`/courses/${course.id}`} className={buttonClasses("secondary", "w-fit")}>
          Back to the course
        </Link>
      </div>
    </div>
  );
}

function PracticalSkeleton() {
  return (
    <div className="page-container flex flex-col gap-8 py-8 lg:py-10" aria-busy="true">
      <LoadingStatus label="Loading the practical assessment…" />
      <Skeleton className="h-4 w-72 max-w-full" />
      <Skeleton className="h-10 w-96 max-w-full" />
      <Skeleton className="h-48 max-w-2xl" />
    </div>
  );
}
