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
    <div className="flex max-w-4xl flex-col gap-10">
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

      <section aria-labelledby="waiting-heading" className="flex flex-col gap-3">
        <h2 id="waiting-heading" className="text-heading font-semibold">
          Waiting <span className="tabular text-text-muted">{waiting}</span>
        </h2>
        {waiting === 0 ? (
          <p className="text-small text-text-muted">Nothing waiting. New requests appear here.</p>
        ) : (
          <ul className="divide-y divide-border border-y border-border">
            {departments.flatMap((department) =>
              department.requests.map((request) => (
                <li
                  key={request.id}
                  className="flex flex-col gap-3 py-4 md:flex-row md:items-center md:justify-between"
                >
                  <Person row={request} label="Asked" department={department} />
                  <RequestDecisionForm
                    membershipId={request.id}
                    personName={request.person.displayName}
                  />
                </li>
              )),
            )}
          </ul>
        )}
      </section>

      <section aria-labelledby="members-heading" className="flex flex-col gap-6">
        <h2 id="members-heading" className="text-heading font-semibold">
          Members
        </h2>
        {departments
          .filter((department) => department.members.length > 0)
          .map((department) => (
            <div key={department.id} className="flex flex-col gap-2">
              <h3 className="flex items-center gap-2 font-medium">
                <span style={{ color: departmentHueVar(department.hue) }}>
                  <DepartmentIcon icon={department.icon} className="size-4" />
                </span>
                {department.name}
                <span className="tabular text-small text-text-muted">
                  {department.members.length}
                </span>
              </h3>
              <ul className="divide-y divide-border border-y border-border">
                {department.members.map((member) => (
                  <li
                    key={member.id}
                    className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between"
                  >
                    <Person row={member} label="Joined" />
                    <RemoveMemberForm
                      membershipId={member.id}
                      personName={member.person.displayName}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        {departments.some((department) => department.members.length === 0) ? (
          <p className="text-small text-text-muted">
            No members yet in{" "}
            {departments
              .filter((department) => department.members.length === 0)
              .map((department) => department.name)
              .join(", ")}
            .
          </p>
        ) : null}
      </section>
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
    <div className="flex min-w-0 flex-col gap-0.5">
      <p className="font-medium">{row.person.displayName}</p>
      <p className="text-small break-all text-text-secondary">
        {[row.person.email, department ? `wants to join ${department.name}` : null]
          .filter(Boolean)
          .join(" · ")}
      </p>
      <p className="text-small text-text-muted">
        {label} {formatDateTime(when)}
      </p>
    </div>
  );
}
