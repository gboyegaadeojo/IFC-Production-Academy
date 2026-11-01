import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ActionForm, Field, fieldClasses } from "@/components/ui/action-form";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { getAdminAccess } from "@/lib/data/admin/access";
import { getSchedulingSource } from "@/lib/data/planning-center";
import { getServingTeam, getTeamDepartments, type TeamDepartment } from "@/lib/data/teams";
import { departmentHueVar } from "@/lib/domain/departments";
import {
  addableFor,
  addableLabel,
  allTeamMembers,
  positionTeam,
  trainingLabel,
  type Position,
  type TeamPerson,
} from "@/lib/domain/teams";
import { AccessDenied } from "../access-denied";
import { PageSkeleton } from "../page-skeleton";
import { addToTeamAction, removeFromTeamAction, setLeadsAction, setSeesAllAction } from "./actions";

export const metadata: Metadata = { title: "Serving teams" };

export default function TeamsPage({ searchParams }: PageProps<"/admin/teams">) {
  return (
    <Suspense fallback={<PageSkeleton label="Loading serving teams…" />}>
      <TeamsContent searchParams={searchParams} />
    </Suspense>
  );
}

/**
 * Position teams (decision record 9), as in Planning Center Services: people are added to each
 * position, and a position can only be filled from its team. Training shows beside each name.
 */
async function TeamsContent({ searchParams }: Pick<PageProps<"/admin/teams">, "searchParams">) {
  const { grants, allowed } = await getAdminAccess("teams");
  if (!allowed) {
    return <AccessDenied />;
  }
  const departments = await getTeamDepartments(grants);
  const params = await searchParams;
  const selected = departments.find((d) => d.id === params.department) ?? departments[0];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Serving teams"
        description="Who serves in each position, with their training beside their name, and what each position sees on the day. While Planning Center schedules, people are added to positions there, and appear here after the next read."
      />
      {departments.length > 1 ? (
        <nav aria-label="Choose a department" className="flex flex-wrap gap-2">
          {departments.map((department) => (
            <DepartmentChip
              key={department.id}
              department={department}
              current={department.id === selected?.id}
            />
          ))}
        </nav>
      ) : null}
      {selected ? (
        <DepartmentTeams department={selected} />
      ) : (
        <EmptyState title="No departments">There are no departments to set up yet.</EmptyState>
      )}
    </div>
  );
}

function DepartmentChip({ department, current }: { department: TeamDepartment; current: boolean }) {
  return (
    <Link
      href={`/admin/teams?department=${department.id}`}
      aria-current={current ? "true" : undefined}
      style={{ "--dept": departmentHueVar(department.hue) } as CSSProperties}
      className={`inline-flex min-h-control items-center gap-2 rounded-pill border px-3 text-small transition-surface ${
        current
          ? "border-accent-light bg-hover font-medium text-text"
          : "border-border text-text-secondary hover:border-border-strong hover:text-text"
      }`}
    >
      <span aria-hidden="true" className="size-2 rounded-pill bg-[var(--dept)]" />
      {department.name}
    </Link>
  );
}

async function DepartmentTeams({ department }: { department: TeamDepartment }) {
  const [{ positions, people }, source] = await Promise.all([
    getServingTeam(department.id),
    getSchedulingSource(),
  ]);
  const fromPlanningCenter = source === "planning_center";
  if (positions.length === 0) {
    return (
      <EmptyState title={`No positions in ${department.name} yet`}>
        Add its positions (for example Camera 1 and Camera 2) in Competencies and roles, then come
        back to add people to each.
      </EmptyState>
    );
  }
  const everyone = allTeamMembers(people, positions);

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="everyone-heading" className="flex flex-col gap-3">
        <h2 id="everyone-heading" className="flex items-center gap-2 text-heading font-semibold">
          All {department.name} team members
          <span className="tabular font-mono text-small font-normal text-text-muted">
            {everyone.length}
          </span>
        </h2>
        {everyone.length === 0 ? (
          <p className="text-small text-text-muted">
            Nobody yet. Add people to each position below.
          </p>
        ) : (
          <ul className="flex max-w-3xl flex-col divide-y divide-border rounded-card border border-border">
            {everyone.map(({ person, positions: theirs }) => (
              <li key={person.id} className="flex items-center gap-3 px-4 py-3">
                <Avatar name={person.name} />
                <div className="flex min-w-0 flex-col">
                  <span className="font-medium">{person.name}</span>
                  <span className="text-small text-text-secondary">
                    {theirs.map((p) => p.name).join(" · ")}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {positions.map((position) => (
        <PositionTeam
          key={position.id}
          position={position}
          people={people}
          departmentName={department.name}
          fromPlanningCenter={fromPlanningCenter}
        />
      ))}
    </div>
  );
}

function PositionTeam({
  position,
  people,
  departmentName,
  fromPlanningCenter,
}: {
  position: Position;
  people: TeamPerson[];
  departmentName: string;
  fromPlanningCenter: boolean;
}) {
  const team = positionTeam(people, position.id);
  const addable = addableFor(people, position.id);
  const headingId = `position-${position.id}`;

  return (
    <section aria-labelledby={headingId} className="flex max-w-3xl flex-col gap-3">
      <h2 id={headingId} className="flex items-center gap-2 text-heading font-semibold">
        {position.name}
        <span className="tabular font-mono text-small font-normal text-text-muted">
          {team.length}
        </span>
      </h2>
      <div className="flex flex-col gap-1 text-small text-text-secondary">
        <div className="flex flex-wrap items-center gap-3">
          <span>
            Sees all departments: <strong>{position.seesAll ? "Yes" : "No"}</strong>
          </span>
          <ActionForm
            action={setSeesAllAction}
            submitLabel={position.seesAll ? "Turn off" : "Turn on"}
            pendingLabel="Saving…"
            variant="tertiary"
            hidden={{ roleId: position.id, seesAll: position.seesAll ? "false" : "true" }}
            srLabel={`Sees all departments for ${position.name}`}
            className="flex"
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span>
            Gets the Director role while scheduled:{" "}
            <strong>{position.leadsService ? "Yes" : "No"}</strong>
          </span>
          <ActionForm
            action={setLeadsAction}
            submitLabel={position.leadsService ? "Turn off" : "Turn on"}
            pendingLabel="Saving…"
            variant="tertiary"
            hidden={{ roleId: position.id, leads: position.leadsService ? "false" : "true" }}
            srLabel={`the Director role for ${position.name}`}
            className="flex"
          />
        </div>
      </div>
      {team.length === 0 ? (
        <p className="text-small text-text-muted">
          Nobody can be scheduled as {position.name} yet.
        </p>
      ) : (
        <ul
          aria-label={`${position.name} team`}
          className="flex flex-col divide-y divide-border rounded-card border border-border"
        >
          {team.map((person) => {
            const trained = trainingLabel(person, position.id);
            return (
              <li
                key={person.id}
                className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{person.name}</span>
                  <StatusBadge tone={trained === "Trained" ? "success" : "neutral"}>
                    {trained}
                  </StatusBadge>
                </span>
                {fromPlanningCenter ? null : (
                  <ActionForm
                    action={removeFromTeamAction}
                    submitLabel="Remove"
                    pendingLabel="Removing…"
                    variant="tertiary"
                    hidden={{ roleId: position.id, userId: person.id }}
                    srLabel={`${person.name} from ${position.name}`}
                    className="flex"
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
      {!fromPlanningCenter && addable.length > 0 ? (
        <details className="rounded-card border border-dashed border-border px-5 py-3">
          <summary className="flex min-h-control cursor-pointer items-center text-small font-medium text-accent-light">
            Add someone<span className="sr-only"> as {position.name}</span>
          </summary>
          <ActionForm
            action={addToTeamAction}
            submitLabel="Add"
            pendingLabel="Adding…"
            variant="secondary"
            hidden={{ roleId: position.id }}
            className="mt-3 flex flex-col gap-3"
          >
            <Field
              id={`add-${position.id}`}
              label={`Add to ${position.name}`}
              hint={`Trained people are listed first. Anyone not in ${departmentName} yet joins it too.`}
            >
              <select
                id={`add-${position.id}`}
                name="userId"
                aria-describedby={`add-${position.id}-hint`}
                className={fieldClasses}
              >
                {addable.map((person) => (
                  <option key={person.id} value={person.id}>
                    {addableLabel(person, position.id)}
                  </option>
                ))}
              </select>
            </Field>
          </ActionForm>
        </details>
      ) : null}
    </section>
  );
}
