import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { ChevronDownIcon } from "@/components/ui/icons";
import { DepartmentIcon } from "@/components/department-icon";
import Link from "next/link";
import { Suspense } from "react";
import { ActionForm, Field, SwitchForm } from "@/components/ui/action-form";
import { fieldClasses } from "@/components/ui/field-classes";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { getAdminAccess } from "@/lib/data/admin/access";
import { getSchedulingSource } from "@/lib/data/planning-center";
import {
  getServingTeam,
  getStartHereStatus,
  getTeamDepartments,
  type TeamDepartment,
} from "@/lib/data/teams";
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
  const source = await getSchedulingSource();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Serving teams"
        description={
          source === "planning_center"
            ? "Team managers add people in Planning Center when they're ready, and they appear here after the next read. Training shows here so you know who may need a hand."
            : "Team managers add people when they're ready. Training shows here so you know who may need a hand."
        }
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
  const [{ positions, people }, source, startHere] = await Promise.all([
    getServingTeam(department.id),
    getSchedulingSource(),
    getStartHereStatus(department.id),
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
      <details className="group rounded-card border border-border bg-surface [&_summary::-webkit-details-marker]:hidden">
        <summary className="flex min-h-touch cursor-pointer list-none items-center gap-2 px-4 py-2 font-medium">
          All {department.name} team members
          <span className="tabular text-small font-normal text-text-muted">{everyone.length}</span>
          <ChevronDownIcon className="ml-auto size-4 text-text-muted transition-surface group-open:rotate-180" />
        </summary>
        <div className="border-t border-border">
          {everyone.length === 0 ? (
            <p className="text-small text-text-muted">
              Nobody yet. Add people to each position below.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
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
        </div>
      </details>

      {positions.map((position) => (
        <PositionTeam
          startHere={startHere}
          key={position.id}
          position={position}
          people={people}
          department={department}
          fromPlanningCenter={fromPlanningCenter}
        />
      ))}
      <p className="max-w-[40rem] rounded-card border border-border bg-card px-3 py-2.5 text-small text-text-secondary">
        This is information for the team manager, never a block. A column appears for each course
        marked Start here in Curriculum.
      </p>
    </div>
  );
}

function PositionTeam({
  position,
  people,
  department,
  fromPlanningCenter,
  startHere,
}: {
  position: Position;
  people: TeamPerson[];
  department: TeamDepartment;
  fromPlanningCenter: boolean;
  startHere: Map<string, { title: string; finished: boolean }[]>;
}) {
  const team = positionTeam(people, position.id);
  const addable = addableFor(people, position.id);
  const headingId = `position-${position.id}`;
  const departmentName = department.name;
  const startHereTitles = [
    ...new Set([...startHere.values()].flatMap((courses) => courses.map((course) => course.title))),
  ];

  return (
    <section
      aria-labelledby={headingId}
      style={{ "--dept": departmentHueVar(department.hue) } as CSSProperties}
      className="flex flex-col gap-3"
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="flex size-9 shrink-0 items-center justify-center rounded-button border border-[color-mix(in_srgb,var(--dept)_18%,var(--border))] bg-[color-mix(in_srgb,var(--dept)_11%,var(--surface))] text-[var(--dept)]"
        >
          <DepartmentIcon icon={department.icon} className="size-4" />
        </span>
        <div className="flex flex-col">
          <h2 id={headingId} className="flex items-center gap-2 text-heading font-semibold">
            {position.name}
            <span className="tabular text-small font-normal text-text-muted">{team.length}</span>
          </h2>
          <p className="text-small text-text-muted">{departmentName}</p>
        </div>
      </div>
      {team.length === 0 ? (
        <p className="text-small text-text-muted">
          Nobody can be scheduled as {position.name} yet.
        </p>
      ) : (
        <div className="relative overflow-x-auto rounded-card border border-border bg-surface">
          <table
            aria-label={`${position.name} team`}
            className="stack-table w-full text-left text-small"
          >
            <thead className="border-b border-border text-text-muted">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">
                  Name
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  For this position
                </th>
                {startHereTitles.map((title) => (
                  <th key={title} scope="col" className="px-4 py-3 font-medium">
                    {title}
                  </th>
                ))}
                {fromPlanningCenter ? null : (
                  <th scope="col" className="px-4 py-3 font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {team.map((person) => {
                const trained = trainingLabel(person, position.id);
                return (
                  <tr key={person.id}>
                    <td className="px-4 py-3 font-medium text-text">{person.name}</td>
                    <td data-label="For this position" className="px-4 py-3">
                      <StatusBadge tone={trained === "Trained" ? "success" : "neutral"}>
                        {trained}
                      </StatusBadge>
                    </td>
                    {startHereTitles.map((title) => {
                      const finished = startHere
                        .get(person.id)
                        ?.some((course) => course.title === title && course.finished);
                      return (
                        <td key={title} data-label={title} className="px-4 py-3">
                          <StatusBadge tone={finished ? "success" : "neutral"}>
                            {finished ? "Done" : "Not yet"}
                          </StatusBadge>
                        </td>
                      );
                    })}
                    {fromPlanningCenter ? null : (
                      <td className="px-4 py-3 text-right">
                        <ActionForm
                          action={removeFromTeamAction}
                          submitLabel="Remove"
                          pendingLabel="Removing…"
                          variant="tertiary"
                          hidden={{ roleId: position.id, userId: person.id }}
                          srLabel={`${person.name} from ${position.name}`}
                          className="flex justify-end"
                        />
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex flex-col text-small text-text-secondary">
        <SwitchForm
          action={setSeesAllAction}
          hidden={{ roleId: position.id }}
          name="seesAll"
          checked={Boolean(position.seesAll)}
          label="Sees all departments"
        />
        <SwitchForm
          action={setLeadsAction}
          hidden={{ roleId: position.id }}
          name="leads"
          checked={Boolean(position.leadsService)}
          label="Gets the Director role while scheduled"
        />
      </div>
      {!fromPlanningCenter && addable.length > 0 ? (
        <details className="rounded-card border border-border bg-surface px-5 py-3">
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
