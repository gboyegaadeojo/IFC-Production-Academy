import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ActionForm, Field, fieldClasses } from "@/components/ui/action-form";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { getAdminAccess } from "@/lib/data/admin/access";
import { getPracticalEditor, type PracticalEditor } from "@/lib/data/practicals";
import { hasCapability } from "@/lib/domain/capabilities";
import { passRuleLabel } from "@/lib/domain/practical";
import { AccessDenied } from "../../../../access-denied";
import { PageSkeleton } from "../../../../page-skeleton";
import {
  addCriterionAction,
  deleteCriterionAction,
  deletePracticalAction,
  moveCriterionAction,
  updatePracticalAction,
} from "../../../practical-actions";

export const metadata: Metadata = { title: "Practical assessment" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Props = PageProps<"/admin/curriculum/[courseId]/practicals/[practicalId]">;

export default function PracticalEditorPage({ params }: Props) {
  return (
    <Suspense fallback={<PageSkeleton label="Loading the practical…" />}>
      <PracticalEditorContent params={params} />
    </Suspense>
  );
}

/**
 * Practical checklist editor (SRS-ASSESS-001, -002, -005): observable criteria, each required or
 * optional, the pass rule, and the competency a pass grants. Changes only in a draft.
 */
async function PracticalEditorContent({ params }: Pick<Props, "params">) {
  const { grants, allowed } = await getAdminAccess("curriculum");
  if (!allowed) {
    return <AccessDenied />;
  }
  const { courseId, practicalId } = await params;
  if (!UUID.test(courseId) || !UUID.test(practicalId)) {
    notFound();
  }
  const practical = await getPracticalEditor(practicalId);
  if (!practical || practical.courseId !== courseId) {
    notFound();
  }
  const editable =
    practical.editable && hasCapability(grants, "course.draft", practical.departmentId);
  const rule = {
    requireAllRequired: practical.requireAllRequired,
    passMinPercent: practical.passMinPercent,
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <Breadcrumbs
          items={[
            { label: "Curriculum", href: "/admin/curriculum" },
            { label: "Course", href: `/admin/curriculum/${courseId}?tab=practicals` },
            { label: practical.title },
          ]}
        />
        <p className="eyebrow">Practical assessment</p>
        <h1 className="text-title font-semibold">{practical.title}</h1>
        <div className="flex flex-wrap gap-2">
          <StatusBadge tone={editable ? "pending" : "neutral"}>
            {editable ? "In your draft" : "Read only"}
          </StatusBadge>
          <StatusBadge tone="info">{passRuleLabel(rule)}</StatusBadge>
        </div>
        <p className="max-w-2xl text-small text-text-muted">
          The observer ticks what they saw. The Academy works out Pass or Not yet from your rule;
          nobody picks the result. A pass grants{" "}
          {practical.competency ? `“${practical.competency.name}”` : "no competency yet"}, and
          Approved to Serve follows for roles that need it.
        </p>
      </header>

      {editable ? <SettingsForm practical={practical} /> : null}

      <section aria-labelledby="criteria-heading" className="flex flex-col gap-4">
        <h2 id="criteria-heading" className="text-heading font-semibold">
          Checklist ({practical.criteria.length})
        </h2>
        {practical.criteria.length === 0 ? (
          <EmptyState title="No checklist items yet">
            Add the things an observer should see, for example &ldquo;Frames the speaker with
            headroom&rdquo;. A practical needs at least one before the course is published.
          </EmptyState>
        ) : (
          <ol className="flex max-w-3xl flex-col divide-y divide-border rounded-card border border-border">
            {practical.criteria.map((criterion, index) => (
              <li key={criterion.id} className="flex flex-col gap-2 p-4">
                <p className="font-medium">
                  {index + 1}. {criterion.label}
                  <span className="font-normal text-text-muted">
                    {criterion.isRequired ? " (required)" : " (optional)"}
                  </span>
                </p>
                {criterion.description ? (
                  <p className="text-small text-text-secondary">{criterion.description}</p>
                ) : null}
                {editable ? (
                  <div className="flex flex-wrap gap-1">
                    {index > 0 ? (
                      <ActionForm
                        action={moveCriterionAction}
                        submitLabel="Move up"
                        pendingLabel="Moving…"
                        variant="tertiary"
                        hidden={{ criterionId: criterion.id, direction: "up" }}
                        srLabel={criterion.label}
                        className="flex"
                      />
                    ) : null}
                    {index < practical.criteria.length - 1 ? (
                      <ActionForm
                        action={moveCriterionAction}
                        submitLabel="Move down"
                        pendingLabel="Moving…"
                        variant="tertiary"
                        hidden={{ criterionId: criterion.id, direction: "down" }}
                        srLabel={criterion.label}
                        className="flex"
                      />
                    ) : null}
                    <ActionForm
                      action={deleteCriterionAction}
                      submitLabel="Remove"
                      pendingLabel="Removing…"
                      variant="tertiary"
                      hidden={{ criterionId: criterion.id }}
                      srLabel={criterion.label}
                      className="flex"
                    />
                  </div>
                ) : null}
              </li>
            ))}
          </ol>
        )}
        {editable ? (
          <div className="max-w-3xl rounded-card border border-dashed border-border p-5">
            <ActionForm
              action={addCriterionAction}
              submitLabel="Add to checklist"
              pendingLabel="Adding…"
              variant="secondary"
              hidden={{ practicalId: practical.id, versionId: practical.courseVersionId }}
              className="flex flex-col gap-3"
            >
              <Field
                id="new-criterion"
                label="What the observer should see"
                hint="Something they can watch happen, not a feeling."
              >
                <input
                  id="new-criterion"
                  name="label"
                  required
                  maxLength={200}
                  aria-describedby="new-criterion-hint"
                  className={fieldClasses}
                />
              </Field>
              <Field id="new-criterion-description" label="More detail (optional)">
                <input
                  id="new-criterion-description"
                  name="description"
                  maxLength={500}
                  className={fieldClasses}
                />
              </Field>
              <label className="flex min-h-control items-center gap-3">
                <input
                  type="checkbox"
                  name="isRequired"
                  defaultChecked
                  className="size-5 accent-accent"
                />
                Required
              </label>
            </ActionForm>
          </div>
        ) : null}
      </section>

      {editable ? (
        <details className="max-w-2xl rounded-card border border-border p-5">
          <summary className="flex min-h-control cursor-pointer items-center font-medium">
            Remove this practical
          </summary>
          <p className="mt-2 text-text-secondary">
            Removes it from the draft. Published versions and everyone&apos;s assessments are kept.
          </p>
          <div className="mt-3">
            <ActionForm
              action={deletePracticalAction}
              submitLabel="Remove practical"
              pendingLabel="Removing…"
              variant="destructive"
              hidden={{ practicalId: practical.id, courseId }}
            />
          </div>
        </details>
      ) : (
        <p className="text-small text-text-muted">
          This is a published version. Choose Edit course on the{" "}
          <Link
            href={`/admin/curriculum/${courseId}`}
            className="text-accent-light underline-offset-4 hover:underline"
          >
            course page
          </Link>{" "}
          to change it in a draft.
        </p>
      )}
    </div>
  );
}

function SettingsForm({ practical }: { practical: PracticalEditor }) {
  const placement =
    practical.afterModuleKey && practical.modules.some((m) => m.key === practical.afterModuleKey)
      ? practical.afterModuleKey
      : "end";
  return (
    <section
      aria-labelledby="settings-heading"
      className="flex max-w-2xl flex-col gap-4 rounded-card border border-border bg-card p-5"
    >
      <h2 id="settings-heading" className="text-subheading font-semibold">
        Settings
      </h2>
      <ActionForm
        action={updatePracticalAction}
        submitLabel="Save settings"
        hidden={{ practicalId: practical.id }}
      >
        <Field id="practical-title" label="Title">
          <input
            id="practical-title"
            name="title"
            required
            maxLength={120}
            defaultValue={practical.title}
            className={fieldClasses}
          />
        </Field>
        <Field
          id="practical-intro"
          label="Introduction (optional)"
          hint="What the assessment involves, shown to volunteers."
        >
          <textarea
            id="practical-intro"
            name="intro"
            rows={3}
            maxLength={1000}
            defaultValue={practical.intro}
            aria-describedby="practical-intro-hint"
            className={`${fieldClasses} py-3`}
          />
        </Field>
        <Field id="practical-placement" label="Where it sits in the course">
          <select
            id="practical-placement"
            name="placement"
            defaultValue={placement}
            className={fieldClasses}
          >
            {practical.modules.map((courseModule) => (
              <option key={courseModule.key} value={courseModule.key}>
                After “{courseModule.title}”
              </option>
            ))}
            <option value="end">At the end of the course</option>
          </select>
        </Field>
        <Field
          id="practical-competency"
          label="Competency a pass grants"
          hint="Set these up in Competencies and roles."
        >
          <select
            id="practical-competency"
            name="competencyId"
            defaultValue={practical.competency?.id ?? "none"}
            aria-describedby="practical-competency-hint"
            className={fieldClasses}
          >
            <option value="none">None (counts towards the course only)</option>
            {practical.competencies.map((competency) => (
              <option key={competency.id} value={competency.id}>
                {competency.name}
              </option>
            ))}
          </select>
        </Field>
        <fieldset className="flex flex-col gap-3 rounded-card border border-border p-4">
          <legend className="px-1 text-small font-medium text-text-secondary">Pass rule</legend>
          <label className="flex min-h-control items-center gap-3">
            <input
              type="checkbox"
              name="requireAllRequired"
              defaultChecked={practical.requireAllRequired}
              className="size-5 accent-accent"
            />
            Every required item must be observed
          </label>
          <Field
            id="practical-percent"
            label="And at least this share of all items (%)"
            hint="The default is 80%. Use 0 to rely on required items only."
          >
            <input
              id="practical-percent"
              name="passMinPercent"
              type="number"
              inputMode="numeric"
              min={0}
              max={100}
              required
              defaultValue={practical.passMinPercent}
              aria-describedby="practical-percent-hint"
              className={`${fieldClasses} w-32`}
            />
          </Field>
        </fieldset>
        <Field
          id="practical-wait"
          label="Days to wait before reassessing (optional)"
          hint="After Not yet, how long to practise before the next assessment. 0 means any time."
        >
          <input
            id="practical-wait"
            name="retryWaitDays"
            type="number"
            inputMode="numeric"
            min={0}
            max={90}
            required
            defaultValue={practical.retryWaitDays}
            aria-describedby="practical-wait-hint"
            className={`${fieldClasses} w-32`}
          />
        </Field>
        <label className="flex min-h-control items-center gap-3">
          <input
            type="checkbox"
            name="isRequired"
            defaultChecked={practical.isRequired}
            className="size-5 accent-accent"
          />
          Must be passed to finish the course
        </label>
      </ActionForm>
    </section>
  );
}
