import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { DepartmentIcon } from "@/components/department-icon";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs } from "@/components/ui/tabs";
import { getAdminAccess } from "@/lib/data/admin/access";
import {
  listDepartmentMembers,
  type DepartmentMembers,
  type MembershipRow,
} from "@/lib/data/admin/members";
import { formatDateTime } from "@/lib/domain/admin";
import { departmentHueVar } from "@/lib/domain/departments";
import { AccessDenied } from "../access-denied";
import { PageSkeleton } from "../page-skeleton";
import { RemoveMemberForm, RequestDecisionForm } from "./decision-forms";

export const metadata: Metadata = { title: "Membership requests" };

export default function MembersPage({ searchParams }: PageProps<"/admin/members">) {
  return (
    <Suspense fallback={<PageSkeleton label="Loading membership requests…" />}>
      <MembersContent searchParams={searchParams} />
    </Suspense>
  );
}

/**
 * Membership review inbox (DESIGN §7.2, SRS-MEM-003): waiting requests and current members, with
 * a department filter. Decisions still go through decide_membership(), which checks scope and
 * writes the history and audit events.
 */
async function MembersContent({ searchParams }: Pick<PageProps<"/admin/members">, "searchParams">) {
  const { grants, allowed } = await getAdminAccess("members");
  if (!allowed) {
    return <AccessDenied />;
  }
  const params = await searchParams;
  const view = params.view === "members" ? "members" : "waiting";
  const all = await listDepartmentMembers(grants);
  const filterId = typeof params.department === "string" ? params.department : null;
  const departments = filterId ? all.filter((d) => d.id === filterId) : all;
  const waiting = departments.reduce((total, d) => total + d.requests.length, 0);
  const members = departments.reduce((total, d) => total + d.members.length, 0);

  const href = (next: { view?: string; department?: string | null }) => {
    const query = new URLSearchParams();
    const nextView = next.view ?? view;
    const nextDepartment = next.department === undefined ? filterId : next.department;
    if (nextView === "members") {
      query.set("view", "members");
    }
    if (nextDepartment) {
      query.set("department", nextDepartment);
    }
    const text = query.toString();
    return text ? `/admin/members?${text}` : "/admin/members";
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Membership requests"
        description="Approving gives someone the department's training. It doesn't approve them to serve."
      />

      <Tabs
        label="Membership views"
        tabs={[
          {
            href: href({ view: "waiting" }),
            label: "Waiting",
            count: waiting,
            current: view === "waiting",
          },
          {
            href: href({ view: "members" }),
            label: "Members",
            count: members,
            current: view === "members",
          },
        ]}
      />

      {all.length > 1 ? (
        <nav aria-label="Filter by department" className="flex flex-wrap gap-2">
          <FilterChip href={href({ department: null })} current={filterId === null}>
            All departments
          </FilterChip>
          {all.map((department) => (
            <FilterChip
              key={department.id}
              href={href({ department: department.id })}
              current={filterId === department.id}
              hue={department.hue}
            >
              {department.name}
            </FilterChip>
          ))}
        </nav>
      ) : null}

      {view === "waiting" ? (
        <WaitingList departments={departments} />
      ) : (
        <MemberList departments={departments} />
      )}
    </div>
  );
}

function FilterChip({
  href,
  current,
  hue,
  children,
}: {
  href: string;
  current: boolean;
  hue?: string;
  children: string;
}) {
  return (
    <Link
      href={href}
      aria-current={current ? "true" : undefined}
      style={hue ? ({ "--dept": departmentHueVar(hue) } as CSSProperties) : undefined}
      className={`inline-flex min-h-control items-center gap-2 rounded-pill border px-3 text-small transition-surface ${
        current
          ? "border-accent-light bg-hover font-medium text-text"
          : "border-border text-text-secondary hover:border-border-strong hover:text-text"
      }`}
    >
      {hue ? <span aria-hidden="true" className="size-2 rounded-pill bg-[var(--dept)]" /> : null}
      {children}
    </Link>
  );
}

function WaitingList({ departments }: { departments: DepartmentMembers[] }) {
  const rows = departments
    .flatMap((department) => department.requests.map((request) => ({ request, department })))
    .toSorted((a, b) => a.request.requestedAt.localeCompare(b.request.requestedAt));
  if (rows.length === 0) {
    return (
      <EmptyState title="Nothing waiting">
        New requests to join appear here, oldest first. You can also invite people directly from
        Invitations.
      </EmptyState>
    );
  }
  return (
    <ul className="divide-y divide-border rounded-card border border-border">
      {rows.map(({ request, department }) => (
        <li
          key={request.id}
          className="flex flex-col gap-4 p-4 md:flex-row md:items-start md:justify-between"
        >
          <Person row={request} label="Asked" department={department} />
          <RequestDecisionForm membershipId={request.id} personName={request.person.displayName} />
        </li>
      ))}
    </ul>
  );
}

function MemberList({ departments }: { departments: DepartmentMembers[] }) {
  const withMembers = departments.filter((department) => department.members.length > 0);
  const empty = departments.filter((department) => department.members.length === 0);
  if (withMembers.length === 0) {
    return (
      <EmptyState title="No members yet">
        People appear here once their request is approved or they accept an invitation.
      </EmptyState>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      {withMembers.map((department) => (
        <section
          key={department.id}
          aria-labelledby={`members-${department.id}`}
          className="flex flex-col gap-2"
        >
          <h2 id={`members-${department.id}`} className="flex items-center gap-2 font-medium">
            <span style={{ color: departmentHueVar(department.hue) }}>
              <DepartmentIcon icon={department.icon} className="size-4" />
            </span>
            {department.name}
            <span className="tabular font-mono text-small text-text-muted">
              {department.members.length}
            </span>
          </h2>
          <ul className="divide-y divide-border rounded-card border border-border">
            {department.members.map((member) => (
              <li
                key={member.id}
                className="flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:justify-between"
              >
                <Person row={member} label="Joined" />
                <RemoveMemberForm membershipId={member.id} personName={member.person.displayName} />
              </li>
            ))}
          </ul>
        </section>
      ))}
      {empty.length > 0 ? (
        <p className="text-small text-text-muted">
          No members yet in {empty.map((department) => department.name).join(", ")}.
        </p>
      ) : null}
    </div>
  );
}

function Person({
  row,
  label,
  department,
}: {
  row: MembershipRow;
  label: "Asked" | "Joined";
  department?: { name: string; hue: string; icon: string };
}) {
  const when = label === "Asked" ? row.requestedAt : (row.decidedAt ?? row.requestedAt);
  return (
    <div className="flex min-w-0 items-start gap-3">
      <Avatar name={row.person.displayName} />
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="font-medium">{row.person.displayName}</p>
        {row.person.email ? (
          <p className="truncate text-small text-text-secondary" title={row.person.email}>
            {row.person.email}
          </p>
        ) : null}
        <p className="flex flex-wrap items-center gap-x-2 text-small text-text-muted">
          {department ? (
            <span
              className="inline-flex items-center gap-1.5 text-text-secondary"
              style={{ "--dept": departmentHueVar(department.hue) } as CSSProperties}
            >
              <span aria-hidden="true" className="size-2 rounded-pill bg-[var(--dept)]" />
              {department.name}
            </span>
          ) : null}
          <span>
            {label} {formatDateTime(when)}
          </span>
        </p>
      </div>
    </div>
  );
}
