import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { DepartmentIcon } from "@/components/department-icon";
import { ActionForm, Field, fieldClasses } from "@/components/ui/action-form";
import { EmptyState } from "@/components/ui/empty-state";
import { UsersIcon } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/page-header";
import { getAdminAccess } from "@/lib/data/admin/access";
import { getPathwayEditor, getPathways, type PathwayEditor } from "@/lib/data/onboarding";
import { departmentHueVar } from "@/lib/domain/departments";
import { stepNeedsSetup, stepSummary } from "@/lib/domain/onboarding";
import { AccessDenied } from "../access-denied";
import { PageSkeleton } from "../page-skeleton";
import { createPathwayAction, updatePathwayAction } from "./actions";
import { Workspace } from "./workspace";

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
  // When the address names a pathway, load it alongside the list rather than after it.
  const asked = param("pathway");
  const [{ pathways, canCreateGeneral, departmentsWithout }, askedEditor] = await Promise.all([
    getPathways(grants),
    asked ? getPathwayEditor(asked) : null,
  ]);
  const selected = pathways.find((p) => p.id === asked) ?? pathways[0] ?? null;
  const editor = !selected
    ? null
    : askedEditor?.id === selected.id
      ? askedEditor
      : await getPathwayEditor(selected.id);

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
                  className="flex size-6 items-center justify-center rounded-button bg-hover text-[var(--dept)]"
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
          <p className="mt-2 text-small text-text-secondary">
            {canCreateGeneral
              ? "Start with “Join the team”, the pathway everyone goes through first. Then add one for each department: people move into it when they choose that department."
              : "One pathway per department. People move into it when they choose that department in “Join the team”, or when a leader adds them."}
          </p>
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
                placeholder="For example: Camera onboarding"
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
    departments: map(editor.departments),
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
      needsSetup: stepNeedsSetup(s.kind, s.config),
    })),
  }));
  const steps = editor.stages.flatMap((s) => s.steps);
  const initial = steps.some((s) => s.id === stepId)
    ? { kind: "step" as const, id: stepId as string }
    : editor.stages.some((s) => s.id === stageId)
      ? { kind: "stage" as const, id: stageId as string }
      : null;

  return (
    <Workspace
      key={editor.id}
      pathwayId={editor.id}
      stages={stages}
      steps={steps.map((s) => ({ id: s.id, kind: s.kind, title: s.title, config: s.config }))}
      roles={editor.roles}
      people={editor.people}
      courses={editor.courses}
      servingRoles={editor.servingRoles}
      departments={editor.departments}
      initial={initial}
      header={
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
      }
    />
  );
}
