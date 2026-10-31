import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ActionForm, Field, fieldClasses } from "@/components/ui/action-form";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { getAdminAccess } from "@/lib/data/admin/access";
import { listDepartmentIds } from "@/lib/data/departments";
import {
  getAssessableMembers,
  getAssessmentQueue,
  getLivePracticals,
  getRecentAssessments,
  type LivePractical,
} from "@/lib/data/practicals";
import { formatDateTime } from "@/lib/domain/admin";
import { hasCapability } from "@/lib/domain/capabilities";
import { OUTCOME_LABELS, passRuleLabel } from "@/lib/domain/practical";
import { AccessDenied } from "../access-denied";
import { PageSkeleton } from "../page-skeleton";
import { recordAssessmentAction, voidAssessmentAction } from "./actions";

export const metadata: Metadata = { title: "Assessments" };

export default function AssessmentsPage({ searchParams }: PageProps<"/admin/assessments">) {
  return (
    <Suspense fallback={<PageSkeleton label="Loading assessments…" />}>
      <AssessmentsContent searchParams={searchParams} />
    </Suspense>
  );
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function practicalValue(entry: { courseId: string; practical: { key: string } }): string {
  return `${entry.courseId}:${entry.practical.key}`;
}

/**
 * Practical assessments for trainers and leaders (SRS-ASSESS-003..007, ADD-ASSESS-01): the queue of
 * people who asked to be assessed, the checklist to record what you observed, and recent results.
 * There's no outcome to pick: the Academy works it out from the ticks and the pass rule.
 */
async function AssessmentsContent({
  searchParams,
}: Pick<PageProps<"/admin/assessments">, "searchParams">) {
  const { user, grants, allowed } = await getAdminAccess("assessments");
  if (!allowed) {
    return <AccessDenied />;
  }
  const query = await searchParams;
  const departmentIds = [
    ...new Set(
      grants
        .filter(
          (grant) =>
            grant.capability === "assessment.record" || grant.capability === "competency.approve",
        )
        .flatMap((grant) => (grant.departmentId ? [grant.departmentId] : [])),
    ),
  ];
  const everywhere = grants.some(
    (grant) =>
      (grant.capability === "assessment.record" || grant.capability === "competency.approve") &&
      grant.departmentId === null,
  );
  const live = await getLivePracticals(everywhere ? await listDepartmentIds() : departmentIds);
  const assessFor = live.filter((entry) =>
    hasCapability(grants, "assessment.record", entry.departmentId),
  );
  const visibleDepartments = [...new Set(live.map((entry) => entry.departmentId))];
  const [queue, recent] = await Promise.all([
    getAssessmentQueue(grants, visibleDepartments),
    getRecentAssessments(visibleDepartments),
  ]);

  const chosenValue = typeof query.practical === "string" ? query.practical : "";
  const chosen = assessFor.find((entry) => practicalValue(entry) === chosenValue) ?? null;
  const learnerId =
    typeof query.learner === "string" && UUID.test(query.learner) ? query.learner : null;
  const members = chosen
    ? (await getAssessableMembers(chosen.departmentId)).filter((m) => m.id !== user.id)
    : [];
  const learner = members.find((m) => m.id === learnerId) ?? null;
  const titleFor = (courseId: string, key: string) => {
    const entry = live.find((e) => e.courseId === courseId && e.practical.key === key);
    return entry ? `${entry.practical.title} (${entry.courseTitle})` : "A practical assessment";
  };

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        title="Assessments"
        description="Watch the volunteer work, tick what you saw, and add feedback. The Academy works out the result from the leader's pass rule. A pass grants the competency, and Approved to Serve follows automatically."
      />

      <section aria-labelledby="queue-heading" className="flex flex-col gap-3">
        <h2 id="queue-heading" className="text-heading font-semibold">
          Waiting for assessment
        </h2>
        {queue.length === 0 ? (
          <EmptyState title="Nobody is waiting">
            Volunteers appear here when they ask to be assessed on a practical.
          </EmptyState>
        ) : (
          <ul className="flex max-w-3xl flex-col divide-y divide-border rounded-card border border-border">
            {queue.map((entry) => (
              <li
                key={entry.requestId}
                className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="flex flex-col">
                  <span className="font-medium">{entry.learnerName}</span>
                  <span className="text-small text-text-muted">
                    {titleFor(entry.courseId, entry.practicalKey)} · asked{" "}
                    {formatDateTime(entry.requestedAt)}
                  </span>
                </span>
                <Link
                  href={`/admin/assessments?practical=${entry.courseId}:${entry.practicalKey}&learner=${entry.learnerId}#record-heading`}
                  className="text-small font-medium text-accent-light underline-offset-4 hover:underline"
                >
                  Assess now<span className="sr-only"> {entry.learnerName}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="record-heading" className="flex flex-col gap-4">
        <h2 id="record-heading" className="text-heading font-semibold">
          Record an assessment
        </h2>
        {assessFor.length === 0 ? (
          <EmptyState title="No practicals to assess yet">
            Practical assessments appear here once a course with one is published in a department
            you assess for.
          </EmptyState>
        ) : (
          <form className="flex max-w-3xl flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="flex flex-1 flex-col gap-2">
              <label
                htmlFor="choose-practical"
                className="text-small font-medium text-text-secondary"
              >
                Practical
              </label>
              <select
                id="choose-practical"
                name="practical"
                defaultValue={chosen ? practicalValue(chosen) : ""}
                className={fieldClasses}
              >
                <option value="">Choose a practical</option>
                {assessFor.map((entry) => (
                  <option key={practicalValue(entry)} value={practicalValue(entry)}>
                    {entry.practical.title} ({entry.courseTitle})
                  </option>
                ))}
              </select>
            </div>
            {chosen ? (
              <div className="flex flex-1 flex-col gap-2">
                <label
                  htmlFor="choose-learner"
                  className="text-small font-medium text-text-secondary"
                >
                  Volunteer
                </label>
                <select
                  id="choose-learner"
                  name="learner"
                  defaultValue={learner?.id ?? ""}
                  className={fieldClasses}
                >
                  <option value="">Choose who you watched</option>
                  {members.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <Button type="submit" variant="secondary">
              {chosen ? "Show the checklist" : "Next"}
            </Button>
          </form>
        )}
        {chosen && learner ? <Checklist entry={chosen} learner={learner} /> : null}
      </section>

      <section aria-labelledby="recent-heading" className="flex flex-col gap-3">
        <h2 id="recent-heading" className="text-heading font-semibold">
          Recent assessments
        </h2>
        {recent.length === 0 ? (
          <EmptyState title="No assessments yet">
            Each one is kept with who observed it, what they saw, and the result.
          </EmptyState>
        ) : (
          <ul className="flex max-w-3xl flex-col divide-y divide-border rounded-card border border-border">
            {recent.map((assessment) => (
              <li key={assessment.id} className="flex flex-col gap-2 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{assessment.learnerName}</span>
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
                  {titleFor(assessment.courseId, assessment.practicalKey)} · observed by{" "}
                  {assessment.observerName} · {formatDateTime(assessment.assessedAt)} ·{" "}
                  {assessment.observedCount} of {assessment.criteriaCount} items
                </p>
                {assessment.voidReason ? (
                  <p className="text-small text-text-secondary">
                    Withdrawn: {assessment.voidReason}
                  </p>
                ) : null}
                {!assessment.voidedAt &&
                hasCapability(grants, "competency.approve", assessment.departmentId) ? (
                  <details>
                    <summary className="flex min-h-control cursor-pointer items-center text-small font-medium text-text-secondary hover:text-text">
                      Withdraw this assessment
                      <span className="sr-only"> for {assessment.learnerName}</span>
                    </summary>
                    <div className="mt-2">
                      <ActionForm
                        action={voidAssessmentAction}
                        submitLabel="Withdraw assessment"
                        pendingLabel="Withdrawing…"
                        variant="destructive"
                        hidden={{ assessmentId: assessment.id }}
                      >
                        <Field
                          id={`void-${assessment.id}`}
                          label="Reason"
                          hint="For example, recorded against the wrong person. Kept in the audit log."
                        >
                          <input
                            id={`void-${assessment.id}`}
                            name="reason"
                            required
                            maxLength={300}
                            aria-describedby={`void-${assessment.id}-hint`}
                            className={fieldClasses}
                          />
                        </Field>
                      </ActionForm>
                    </div>
                  </details>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Checklist({
  entry,
  learner,
}: {
  entry: LivePractical;
  learner: { id: string; name: string };
}) {
  const { practical } = entry;
  return (
    <div className="flex max-w-3xl flex-col gap-4 rounded-card border border-border bg-card p-5">
      <div className="flex flex-col gap-1">
        <h3 className="text-subheading font-semibold">
          {practical.title}: {learner.name}
        </h3>
        <p className="text-small text-text-muted">
          {passRuleLabel({
            requireAllRequired: practical.requireAllRequired,
            passMinPercent: practical.passMinPercent,
          })}
          . Tick only what you saw today.
        </p>
      </div>
      <ActionForm
        action={recordAssessmentAction}
        submitLabel="Record assessment"
        pendingLabel="Recording…"
        hidden={{ courseId: entry.courseId, practicalKey: practical.key, learnerId: learner.id }}
      >
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-2 text-small font-medium text-text-secondary">
            What you observed
          </legend>
          {practical.criteria.map((criterion) => (
            <label
              key={criterion.id}
              className="flex min-h-touch cursor-pointer items-start gap-3 rounded-button px-1 py-2 hover:bg-hover"
            >
              <input
                type="checkbox"
                name="observed"
                value={criterion.id}
                className="mt-0.5 size-5 shrink-0 accent-accent"
              />
              <span className="flex flex-col">
                <span>
                  {criterion.label}
                  <span className="text-text-muted">
                    {criterion.isRequired ? " (required)" : " (optional)"}
                  </span>
                </span>
                {criterion.description ? (
                  <span className="text-small text-text-secondary">{criterion.description}</span>
                ) : null}
              </span>
            </label>
          ))}
        </fieldset>
        <Field
          id="assessment-feedback"
          label="Feedback for the volunteer"
          hint="They'll see this. Say what went well and what to practise."
        >
          <textarea
            id="assessment-feedback"
            name="feedback"
            rows={4}
            maxLength={2000}
            aria-describedby="assessment-feedback-hint"
            className={`${fieldClasses} py-3`}
          />
        </Field>
      </ActionForm>
    </div>
  );
}
