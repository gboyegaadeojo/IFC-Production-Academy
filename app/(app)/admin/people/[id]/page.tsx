import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { StatusBadge } from "@/components/ui/status-badge";
import { getAdminAccess } from "@/lib/data/admin/access";
import { getPerson } from "@/lib/data/admin/people";
import { ACCOUNT_STATUS_LABELS, accountStatusChanges, formatDateTime } from "@/lib/domain/admin";
import { hasCapability } from "@/lib/domain/capabilities";
import { AccessDenied } from "../../access-denied";
import { PageSkeleton } from "../../page-skeleton";
import { AccountStatusForm, GrantRoleForm, RevokeRoleForm } from "./person-forms";

export const metadata: Metadata = { title: "Person" };

export default function PersonPage({ params }: PageProps<"/admin/people/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton label="Loading person…" />}>
      <PersonContent params={params} />
    </Suspense>
  );
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function PersonContent({ params }: Pick<PageProps<"/admin/people/[id]">, "params">) {
  const { user, grants, allowed } = await getAdminAccess("people");
  if (!allowed) {
    return <AccessDenied />;
  }
  const { id } = await params;
  if (!UUID.test(id)) {
    notFound();
  }
  const data = await getPerson(id);
  if (!data) {
    notFound();
  }
  const { person, roles, departments } = data;
  const isSelf = person.id === user.id;
  const canAssign = hasCapability(grants, "role.assign");
  const canManageAccount = hasCapability(grants, "user.manage");
  const current = person.roles.filter((role) => role.revokedAt === null);
  const past = person.roles.filter((role) => role.revokedAt !== null);
  const roleLabel = (role: (typeof person.roles)[number]) =>
    role.departmentName ? `${role.roleName}, ${role.departmentName}` : role.roleName;

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-3">
        <Link
          href="/admin/people"
          className="text-small text-accent-light underline-offset-4 hover:underline"
        >
          ← All people
        </Link>
        <h1 className="text-title font-semibold">{person.displayName}</h1>
        {person.email ? <p className="break-all text-text-secondary">{person.email}</p> : null}
        <p className="text-small text-text-muted">Joined {formatDateTime(person.joinedAt)}</p>
      </div>

      <section aria-labelledby="account-heading" className="flex flex-col gap-4">
        <h2 id="account-heading" className="text-heading font-semibold">
          Account
        </h2>
        <div className="flex flex-col gap-3 rounded-card border border-border bg-card p-5">
          <div>
            <StatusBadge tone={person.status === "active" ? "success" : "pending"}>
              {ACCOUNT_STATUS_LABELS[person.status]}
            </StatusBadge>
          </div>
          {person.statusChangedAt ? (
            <p className="text-small text-text-secondary">
              Changed {formatDateTime(person.statusChangedAt)}
              {person.statusChangedBy ? ` by ${person.statusChangedBy.displayName}` : ""}
              {person.statusReason ? `: ${person.statusReason}` : ""}
            </p>
          ) : null}
          {canManageAccount && !isSelf ? (
            <div className="flex flex-col gap-1">
              {accountStatusChanges(person.status).map((change) => (
                <AccountStatusForm key={change.to} userId={person.id} change={change} />
              ))}
            </div>
          ) : null}
          {isSelf ? (
            <p className="text-small text-text-muted">
              You can&apos;t change your own account status or remove your own roles.
            </p>
          ) : null}
        </div>
      </section>

      <section aria-labelledby="roles-heading" className="flex flex-col gap-4">
        <h2 id="roles-heading" className="text-heading font-semibold">
          Roles
        </h2>
        {current.length === 0 ? (
          <p className="text-text-secondary">No current roles.</p>
        ) : (
          <ul className="divide-y divide-border rounded-card border border-border bg-card">
            {current.map((role) => (
              <li
                key={role.id}
                className="flex flex-col gap-2 p-5 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="flex flex-col gap-1">
                  <p className="font-medium">{roleLabel(role)}</p>
                  {role.roleDescription ? (
                    <p className="text-small text-text-secondary">{role.roleDescription}</p>
                  ) : null}
                  <p className="text-small text-text-muted">
                    Granted {formatDateTime(role.grantedAt)}
                    {role.grantedBy ? ` by ${role.grantedBy.displayName}` : ""}
                  </p>
                </div>
                {canAssign && !isSelf ? (
                  <RevokeRoleForm userRoleId={role.id} label={roleLabel(role)} />
                ) : null}
              </li>
            ))}
          </ul>
        )}

        {canAssign ? (
          <div className="rounded-card border border-border bg-card p-5">
            <h3 className="mb-4 text-subheading font-semibold">Grant a role</h3>
            <GrantRoleForm userId={person.id} roles={roles} departments={departments} />
          </div>
        ) : null}

        {past.length > 0 ? (
          <details className="rounded-card border border-border bg-card p-5">
            <summary className="flex min-h-control cursor-pointer items-center font-semibold">
              Past roles ({past.length})
            </summary>
            <ul className="mt-3 flex flex-col gap-3">
              {past.map((role) => (
                <li key={role.id} className="text-small text-text-secondary">
                  <span className="font-medium text-text">{roleLabel(role)}</span>: granted{" "}
                  {formatDateTime(role.grantedAt)}
                  {role.grantedBy ? ` by ${role.grantedBy.displayName}` : ""}, removed{" "}
                  {role.revokedAt ? formatDateTime(role.revokedAt) : ""}
                  {role.revokedBy ? ` by ${role.revokedBy.displayName}` : ""}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </section>
    </div>
  );
}
