import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { DepartmentIcon } from "@/components/department-icon";
import { ActionForm, Field, fieldClasses } from "@/components/ui/action-form";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { UsersIcon } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/page-header";
import { getAdminAccess } from "@/lib/data/admin/access";
import { getPathwayEditor, getPathways, type PathwayEditor } from "@/lib/data/onboarding";
import { departmentHueVar } from "@/lib/domain/departments";
import { stepSummary } from "@/lib/domain/onboarding";
import { AccessDenied } from "../access-denied";
import { PageSkeleton } from "../page-skeleton";
import {
  addStageAction,
  createPathwayAction,
  removeStageAction,
  updatePathwayAction,
  updateStageAction,
} from "./actions";
import { Builder } from "./builder";
import { StepSettings } from "./step-settings";

export const metadata: Metadata = { title: "Onboarding pathways" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function OnboardingPage({ searchParams }: PageProps<"/admin/onboarding">) {
  return (
    <Suspense fallback={<PageSkeleton label="Loading onboarding pathways…" />}>
      <OnboardingContent searchParams={searchParams} />
    </Suspense>
  );
}

/**
 * Onboarding pathways (docs/decisions/2026-11-01-onboarding-pathways.md; option A of the approved
 * mock): pick a pathway, then build it stage by stage. Leaders see only pathways they look after.
 */
async function OnboardingContent({
  searchParams,
}: Pick<PageProps<"/admin/onboarding">, "searchParams">) {
  const { grants, allowed } = await getAdminAccess("onboarding");
  if (!allowed) {
    return <AccessDenied />;
  }
  const params = await searchParams;
  const param = (key: string) => {
    const value = params[key];
    return typeof value === "string" && UUID.test(value) ? value : null;
  };
  const { pathways, canCreateGeneral, departmentsWithout } = await getPathways(grants);
  const selected = pathways.find((p) => p.id === param("pathway")) ?? pathways[0] ?? null;
  const editor = selected ? await getPathwayEditor(selected.id) : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="People & Teams"
        title="Onboarding pathways"
        description="From “I want to serve” to ready for a team. Build each pathway's stages and steps; people move along by themselves, and you're told when they need you."
      />

      {pathways.length > 0 || canCreateGeneral || departmentsWithout.length > 0 ? (
        <nav aria-label="Pathways" className="flex flex-wrap gap-2">
          {pathways.map((p) => {
            const current = p.id === selected?.id;
            return (
              <Link
                key={p.id}
                href={`/admin/onboarding?pathway=${p.id}`}
                aria-current={current ? "page" : undefined}
                style={{ "--dept": departmentHueVar(p.hue) } as CSSProperties}
                className={`inline-flex min-h-control items-center gap-2 rounded-button border py-1 pr-3 pl-1.5 text-small transition-surface ${
                  current
                    ? "border-accent bg-accent-soft font-semibold text-text shadow-[inset_0_0_0_1px_var(--accent)]"
                    : "border-border bg-surface text-text-secondary hover:border-border-strong hover:text-text"
                }`}
              >
                <span
                  aria-hidden="true"
                  className="flex size-6 items-center justify-center rounded-[7px] bg-hover text-[var(--dept)]"
                >
                  {p.departmentId ? (
                    <DepartmentIcon icon={p.icon} className="size-3.5" />
                  ) : (
                    <UsersIcon className="size-3.5" />
                  )}
                </span>
                {p.name}
                <span className="tabular text-text-muted">{p.activeCount}</span>
                <span className="sr-only"> people in it</span>
              </Link>
            );
          })}
        </nav>
      ) : null}

      {canCreateGeneral || departmentsWithout.length > 0 ? (
        <details className="max-w-xl rounded-card border border-border bg-surface p-4">
          <summary className="cursor-pointer font-medium">Set up a pathway</summary>
          <ActionForm
            action={createPathwayAction}
            submitLabel="Create pathway"
            className="mt-3 flex flex-col gap-3"
          >
            <Field id="new-pathway-dept" label="For">
              <select id="new-pathway-dept" name="departmentId" className={fieldClasses}>
                {canCreateGeneral ? (
                  <option value="">Everyone joining the team (Join the team)</option>
                ) : null}
                {departmentsWithout.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="new-pathway-name" label="Name">
              <input
                id="new-pathway-name"
                name="name"
                required
                maxLength={120}
                defaultValue={pathways.length === 0 && canCreateGeneral ? "Join the team" : ""}
                className={fieldClasses}
              />
            </Field>
          </ActionForm>
        </details>
      ) : null}

      {!editor ? (
        <EmptyState title="No pathways yet">
          Set up &ldquo;Join the team&rdquo; first: everyone who wants to serve starts there, then
          moves into a department&apos;s pathway.
        </EmptyState>
      ) : (
        <Editor editor={editor} stepId={param("step")} stageId={param("stage")} />
      )}
    </div>
  );
}

function Editor({
  editor,
  stepId,
  stageId,
}: {
  editor: PathwayEditor;
  stepId: string | null;
  stageId: string | null;
}) {
  const map = (list: { id: string; name: string }[]) => new Map(list.map((c) => [c.id, c.name]));
  const names = {
    roles: map(editor.roles),
    people: map(editor.people),
    courses: map(editor.courses),
    servingRoles: map(editor.servingRoles),
  };
  const stages = editor.stages.map((stage) => ({
    id: stage.id,
    name: stage.name,
    timing: stage.timing,
    peopleHere: stage.peopleHere,
    steps: stage.steps.map((s) => ({
      id: s.id,
      kind: s.kind,
      title: s.title,
      summary: stepSummary(s.kind, s.config, names),
    })),
  }));
  const step = editor.stages.flatMap((s) => s.steps).find((s) => s.id === stepId) ?? null;
  const stage = editor.stages.find((s) => s.id === stageId) ?? null;

  return (
    <div className="grid items-start gap-5 2xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="text-title font-semibold">{editor.name}</h2>
            {editor.summary ? (
              <p className="max-w-[60ch] text-text-secondary">{editor.summary}</p>
            ) : null}
          </div>
          <details className="w-full max-w-md rounded-card border border-border bg-surface p-3 sm:w-auto">
            <summary className="cursor-pointer text-small font-medium">Rename or describe</summary>
            <ActionForm
              action={updatePathwayAction}
              submitLabel="Save"
              hidden={{ pathwayId: editor.id }}
              className="mt-3 flex flex-col gap-3"
            >
              <Field id="pathway-name" label="Name">
                <input
                  id="pathway-name"
                  name="name"
                  required
                  maxLength={120}
                  defaultValue={editor.name}
                  className={fieldClasses}
                />
              </Field>
              <Field id="pathway-summary" label="What it's for">
                <textarea
                  id="pathway-summary"
                  name="summary"
                  maxLength={500}
                  rows={2}
                  defaultValue={editor.summary}
                  className={`${fieldClasses} py-2`}
                />
              </Field>
            </ActionForm>
          </details>
        </div>
        <Builder pathwayId={editor.id} stages={stages} selectedStepId={step?.id ?? null} />
      </div>

      <div className="flex flex-col gap-4 2xl:sticky 2xl:top-6">
        {step ? (
          <StepSettings
            pathwayId={editor.id}
            step={step}
            roles={editor.roles}
            people={editor.people}
            courses={editor.courses}
            servingRoles={editor.servingRoles}
          />
        ) : stage ? (
          <section
            aria-labelledby="stage-heading"
            className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4"
          >
            <h2 id="stage-heading" className="font-semibold">
              Edit stage
            </h2>
            <ActionForm
              key={stage.id}
              action={updateStageAction}
              submitLabel="Save stage"
              hidden={{ stageId: stage.id }}
              className="flex flex-col gap-3"
            >
              <Field id="stage-name" label="Name">
                <input
                  id="stage-name"
                  name="name"
                  required
                  maxLength={80}
                  defaultValue={stage.name}
                  className={fieldClasses}
                />
              </Field>
              <Field id="stage-timing" label="When" hint="For example “Within 3 days” or “Week 2”.">
                <input
                  id="stage-timing"
                  name="timing"
                  maxLength={40}
                  defaultValue={stage.timing}
                  className={fieldClasses}
                />
              </Field>
            </ActionForm>
            {stage.steps.length === 0 ? (
              <ConfirmDialog
                triggerLabel="Remove stage"
                variant="secondary"
                title={`Remove “${stage.name}”?`}
                message="It has no steps, so nobody is affected."
              >
                <ActionForm
                  action={removeStageAction}
                  submitLabel="Remove stage"
                  variant="destructive"
                  hidden={{ stageId: stage.id }}
                />
              </ConfirmDialog>
            ) : (
              <p className="text-small text-text-muted">
                To remove this stage, move or remove its steps first.
              </p>
            )}
          </section>
        ) : (
          <section className="flex flex-col gap-2 rounded-card border border-border bg-surface p-4 text-small text-text-secondary">
            <h2 className="font-semibold text-text">Edit a step</h2>
            <p>
              Select a step to change what it does. Steps marked &ldquo;waits here&rdquo; pause
              until they&apos;re done.
            </p>
          </section>
        )}

        <section
          aria-labelledby="add-stage-heading"
          className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4"
        >
          <h2 id="add-stage-heading" className="font-semibold">
            Add a stage
          </h2>
          <ActionForm
            action={addStageAction}
            submitLabel="Add stage"
            hidden={{ pathwayId: editor.id }}
            className="flex flex-col gap-3"
          >
            <Field id="new-stage-name" label="Name">
              <input
                id="new-stage-name"
                name="name"
                required
                maxLength={80}
                placeholder="Getting started"
                className={fieldClasses}
              />
            </Field>
            <Field id="new-stage-timing" label="When (optional)">
              <input
                id="new-stage-timing"
                name="timing"
                maxLength={40}
                placeholder="Week 1"
                className={fieldClasses}
              />
            </Field>
          </ActionForm>
        </section>
      </div>
    </div>
  );
}
