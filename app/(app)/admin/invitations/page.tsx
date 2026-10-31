import type { Metadata } from "next";
import { Suspense } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { getAdminAccess } from "@/lib/data/admin/access";
import { listDepartmentSettings } from "@/lib/data/admin/departments";
import { listInvitations } from "@/lib/data/invitations";
import { formatDateTime } from "@/lib/domain/admin";
import { hasCapability } from "@/lib/domain/capabilities";
import { INVITATION_STATE_LABELS, invitationState } from "@/lib/domain/invitations";
import { AccessDenied } from "../access-denied";
import { PageSkeleton } from "../page-skeleton";
import { CreateInvitationForm } from "./create-invitation-form";
import { RevokeInvitationForm } from "./revoke-invitation-form";

export const metadata: Metadata = { title: "Invitations" };

export default function InvitationsPage() {
  return (
    <Suspense fallback={<PageSkeleton label="Loading invitations…" />}>
      <InvitationsContent />
    </Suspense>
  );
}

async function InvitationsContent() {
  const { grants, allowed } = await getAdminAccess("invitations");
  if (!allowed) {
    return <AccessDenied />;
  }
  const [departments, invitations] = await Promise.all([
    listDepartmentSettings(),
    listInvitations(),
  ]);
  // Only open departments the person may invite to.
  const choices = departments
    .filter((d) => d.status === "active" && hasCapability(grants, "member.invite", d.id))
    .map((d) => ({ id: d.id, name: d.name }));
  const allowAcademyOnly = hasCapability(grants, "member.invite");
  const now = new Date();

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        title="Invitations"
        description="Invite someone straight into a department. They join when they accept, because you've already decided. Joining gives them the training; approval to serve still comes after the hands-on checks."
      />

      <section
        aria-labelledby="create-heading"
        className="flex max-w-2xl flex-col gap-5 rounded-card border border-border bg-card p-5 sm:p-6"
      >
        <h2 id="create-heading" className="text-heading font-semibold">
          New invitation
        </h2>
        {choices.length === 0 && !allowAcademyOnly ? (
          <EmptyState title="Nothing to invite people to yet">
            None of your departments is open. Once a department is active, you can invite people to
            it here.
          </EmptyState>
        ) : (
          <CreateInvitationForm departments={choices} allowAcademyOnly={allowAcademyOnly} />
        )}
      </section>

      <section aria-labelledby="list-heading" className="flex flex-col gap-3">
        <h2 id="list-heading" className="text-heading font-semibold">
          Recent invitations
        </h2>
        {invitations.length === 0 ? (
          <EmptyState title="No invitations yet">
            Invitations you create appear here with how many places are used, when they expire, and
            a way to revoke them.
          </EmptyState>
        ) : (
          <div className="overflow-x-auto rounded-card border border-border">
            <table className="w-full min-w-[44rem] text-left text-small">
              <caption className="sr-only">Recent invitations, newest first</caption>
              <thead className="border-b border-border text-text-muted">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Invitation
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Places used
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Expires
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {invitations.map((invitation) => {
                  const state = invitationState(invitation, now);
                  const title = invitation.departmentName ?? "The Academy";
                  return (
                    <tr key={invitation.id} className="align-top">
                      <td className="px-4 py-3">
                        <p className="font-medium text-text">{title}</p>
                        {invitation.note ? (
                          <p className="text-text-secondary">{invitation.note}</p>
                        ) : null}
                        <p className="text-text-muted">
                          Created {formatDateTime(invitation.createdAt)} by{" "}
                          {invitation.createdBy.displayName}
                        </p>
                      </td>
                      <td className="tabular px-4 py-3 font-mono text-text">
                        {invitation.useCount} / {invitation.maxUses}
                      </td>
                      <td className="px-4 py-3 text-text-secondary">
                        {formatDateTime(invitation.expiresAt)}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge tone={state === "active" ? "success" : "neutral"}>
                          {INVITATION_STATE_LABELS[state]}
                        </StatusBadge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {state === "active" ? (
                          <RevokeInvitationForm
                            invitationId={invitation.id}
                            label={`invitation to ${title}`}
                          />
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
