import type { Metadata } from "next";
import { Suspense } from "react";
import { DepartmentIcon } from "@/components/department-icon";
import { getAdminAccess } from "@/lib/data/admin/access";
import { listDepartmentMembers, type MembershipRow } from "@/lib/data/admin/members";
import { formatDateTime } from "@/lib/domain/admin";
import { departmentHueVar } from "@/lib/domain/departments";
import { AccessDenied } from "../access-denied";
import { PageSkeleton } from "../page-skeleton";
import { RemoveMemberForm, RequestDecisionForm } from "./decision-forms";

export const metadata: Metadata = { title: "Membership requests" };

export default function MembersPage() {
  return (
    <Suspense fallback={<PageSkeleton label="Loading membership requests…" />}>
      <MembersContent />
    </Suspense>
  );
}

async function MembersContent() {
  const { grants, allowed } = await getAdminAccess("members");
  if (!allowed) {
    return <AccessDenied />;
  }
  const departments = await listDepartmentMembers(grants);
  const waiting = departments.reduce((total, d) => total + d.requests.length, 0);

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-title font-semibold">Membership requests</h1>
        <p className="max-w-2xl text-text-secondary">
          {waiting === 0
            ? "No one is waiting right now."
            : `${waiting} ${waiting === 1 ? "person is" : "people are"} waiting for a decision.`}{" "}
          Approving gives someone the department&apos;s training. It doesn&apos;t approve them to
          serve.
        </p>
      </header>

      {departments.map((department) => (
        <section
          key={department.id}
          aria-labelledby={`dept-${department.id}`}
          className="flex flex-col gap-5"
        >
          <h2
            id={`dept-${department.id}`}
            className="flex items-center gap-3 text-heading font-semibold"
          >
            <span style={{ color: departmentHueVar(department.hue) }}>
              <DepartmentIcon icon={department.icon} />
            </span>
            {department.name}
          </h2>

          <div className="flex flex-col gap-3">
            <h3 className="text-subheading font-semibold">
              Waiting ({department.requests.length})
            </h3>
            {department.requests.length === 0 ? (
              <p className="text-text-secondary">No requests waiting.</p>
            ) : (
              <ul className="grid gap-4 lg:grid-cols-2">
                {department.requests.map((request) => (
                  <li key={request.id} className="rounded-card border border-border bg-card p-5">
                    <Person row={request} label="Asked" />
                    <div className="mt-4">
                      <RequestDecisionForm
                        membershipId={request.id}
                        personName={request.person.displayName}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex flex-col gap-3">
            <h3 className="text-subheading font-semibold">Members ({department.members.length})</h3>
            {department.members.length === 0 ? (
              <p className="text-text-secondary">No members yet.</p>
            ) : (
              <ul className="divide-y divide-border rounded-card border border-border bg-card">
                {department.members.map((member) => (
                  <li
                    key={member.id}
                    className="flex flex-col gap-2 p-5 sm:flex-row sm:items-start sm:justify-between"
                  >
                    <Person row={member} label="Joined" />
                    <RemoveMemberForm
                      membershipId={member.id}
                      personName={member.person.displayName}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      ))}
    </div>
  );
}

function Person({ row, label }: { row: MembershipRow; label: "Asked" | "Joined" }) {
  const when = label === "Asked" ? row.requestedAt : (row.decidedAt ?? row.requestedAt);
  return (
    <div className="flex flex-col gap-1">
      <p className="font-semibold">{row.person.displayName}</p>
      {row.person.email ? (
        <p className="text-small break-all text-text-secondary">{row.person.email}</p>
      ) : null}
      <p className="text-small text-text-muted">
        {label} {formatDateTime(when)}
      </p>
    </div>
  );
}
