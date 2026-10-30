import type { Metadata } from "next";
import { Suspense } from "react";
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
      <header className="flex flex-col gap-2">
        <h1 className="text-title font-semibold">Invitations</h1>
        <p className="max-w-2xl text-text-secondary">
          Invite someone straight into a department. When they accept, they join without waiting for
          approval, because you&apos;ve already decided. Joining gives them the training; approval
          to serve still comes after a practical assessment.
        </p>
      </header>

      <section
        aria-labelledby="create-heading"
        className="flex max-w-2xl flex-col gap-5 rounded-card border border-border bg-card p-6"
      >
        <h2 id="create-heading" className="text-heading font-semibold">
          New invitation
        </h2>
        {choices.length === 0 && !allowAcademyOnly ? (
          <p className="text-text-secondary">
            None of your departments is open yet, so there&apos;s nothing to invite people to.
          </p>
        ) : (
          <CreateInvitationForm departments={choices} allowAcademyOnly={allowAcademyOnly} />
        )}
      </section>

      <section aria-labelledby="list-heading" className="flex flex-col gap-4">
        <h2 id="list-heading" className="text-heading font-semibold">
          Recent invitations
        </h2>
        {invitations.length === 0 ? (
          <p className="text-text-secondary">No invitations yet.</p>
        ) : (
          <ul className="divide-y divide-border rounded-card border border-border bg-card">
            {invitations.map((invitation) => {
              const state = invitationState(invitation, now);
              const title = invitation.departmentName ?? "The Academy";
              return (
                <li
                  key={invitation.id}
                  className="flex flex-col gap-3 p-5 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="flex flex-col gap-1">
                    <p className="font-semibold">
                      {title}
                      {invitation.note ? (
                        <span className="font-normal text-text-secondary">
                          {" "}
                          · {invitation.note}
                        </span>
                      ) : null}
                    </p>
                    <p className="text-small text-text-secondary">
                      {invitation.useCount} of {invitation.maxUses}{" "}
                      {invitation.maxUses === 1 ? "place" : "places"} used · expires{" "}
                      {formatDateTime(invitation.expiresAt)}
                    </p>
                    <p className="text-small text-text-muted">
                      Created {formatDateTime(invitation.createdAt)} by{" "}
                      {invitation.createdBy.displayName}
                    </p>
                  </div>
                  <div className="flex flex-col items-start gap-1 sm:items-end">
                    <StatusBadge tone={state === "active" ? "success" : "neutral"}>
                      {INVITATION_STATE_LABELS[state]}
                    </StatusBadge>
                    {state === "active" ? (
                      <RevokeInvitationForm
                        invitationId={invitation.id}
                        label={`invitation to ${title}`}
                      />
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
