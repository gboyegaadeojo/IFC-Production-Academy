import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { DepartmentIcon } from "@/components/department-icon";
import { EmptyState } from "@/components/ui/empty-state";
import { UsersIcon } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { getAdminAccess } from "@/lib/data/admin/access";
import { listDepartmentSettings } from "@/lib/data/admin/departments";
import { getCurrentUser } from "@/lib/data/auth";
import { listInvitations, type InvitationRow } from "@/lib/data/invitations";
import { formatDateTime } from "@/lib/domain/admin";
import { hasCapability } from "@/lib/domain/capabilities";
import { departmentHueVar } from "@/lib/domain/departments";
import {
  INVITATION_STATE_LABELS,
  invitationState,
  placesLabel,
  splitInvitations,
} from "@/lib/domain/invitations";
import { AccessDenied } from "../access-denied";
import { PageSkeleton } from "../page-skeleton";
import { CreateInvitationForm } from "./create-invitation-form";
import { RevokeInvitationForm } from "./revoke-invitation-form";

export const metadata: Metadata = { title: "Invitations" };

export default function InvitationsPage({ searchParams }: PageProps<"/admin/invitations">) {
  return (
    <Suspense fallback={<PageSkeleton label="Loading invitations…" />}>
      <InvitationsContent searchParams={searchParams} />
    </Suspense>
  );
}

/**
 * Invitations (SRS-MEM-002; redesign approved 2026-11-01): four short steps with a preview of what
 * the person will see, then the list, split into links that still work and ones that ended. A link
 * is shown only once, when it's created, so the list offers Revoke but never the link itself.
 */
async function InvitationsContent({
  searchParams,
}: Pick<PageProps<"/admin/invitations">, "searchParams">) {
  const { grants, allowed } = await getAdminAccess("invitations");
  if (!allowed) {
    return <AccessDenied />;
  }
  const [departments, invitations, me, params] = await Promise.all([
    listDepartmentSettings(),
    listInvitations(),
    getCurrentUser(),
    searchParams,
  ]);
  // Only open departments the person may invite to.
  const choices = departments
    .filter((d) => d.status === "active" && hasCapability(grants, "member.invite", d.id))
    .map((d) => ({ id: d.id, name: d.name, hue: d.hue, icon: d.icon }));
  const hueFor = new Map(departments.map((d) => [d.id, d]));
  const allowAcademyOnly = hasCapability(grants, "member.invite");
  const now = new Date();
  const { open, past } = splitInvitations(invitations, now);
  const showPast = params.show === "past";
  const shown = showPast ? past : open;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="People & Teams"
        title="Invitations"
        description="Invite someone straight into a department. They join when they accept, because you've already decided. Joining gives them the training; approval to serve still comes after the hands-on checks."
      />

      {choices.length === 0 && !allowAcademyOnly ? (
        <EmptyState title="Nothing to invite people to yet">
          None of your departments is open. Once a department is active, you can invite people to it
          here.
        </EmptyState>
      ) : (
        <CreateInvitationForm
          departments={choices}
          allowAcademyOnly={allowAcademyOnly}
          inviterName={me?.displayName ?? "A leader"}
        />
      )}

      <section
        aria-labelledby="list-heading"
        className="rounded-card border border-border bg-surface"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <h2 id="list-heading" className="text-subheading font-semibold">
            Invitations
          </h2>
          <nav
            aria-label="Which invitations"
            className="flex gap-0.5 rounded-button border border-border bg-card p-[3px]"
          >
            {(
              [
                { past: false, label: "Open", count: open.length },
                { past: true, label: "Used or expired", count: past.length },
              ] as const
            ).map((tab) => (
              <Link
                key={tab.label}
                href={tab.past ? "/admin/invitations?show=past" : "/admin/invitations"}
                aria-current={showPast === tab.past ? "page" : undefined}
                scroll={false}
                className="flex min-h-9 items-center gap-1.5 rounded-[7px] px-3 text-small text-text-secondary transition-surface hover:text-text aria-[current=page]:bg-surface aria-[current=page]:font-semibold aria-[current=page]:text-text aria-[current=page]:shadow-[0_0_0_1px_var(--border)]"
              >
                {tab.label}
                <span className="tabular text-text-muted">{tab.count}</span>
              </Link>
            ))}
          </nav>
        </div>
        {shown.length === 0 ? (
          <p className="px-4 py-8 text-center text-small text-text-secondary">
            {showPast
              ? "Nothing used or expired yet."
              : "No open invitations. Create one above, and it shows here until it's used or expires."}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {shown.map((invitation) => (
              <InvitationItem
                key={invitation.id}
                invitation={invitation}
                department={
                  invitation.departmentId ? hueFor.get(invitation.departmentId) : undefined
                }
                now={now}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function whenLabel(invitation: InvitationRow, state: ReturnType<typeof invitationState>): string {
  switch (state) {
    case "active":
      return `Works until ${formatDateTime(invitation.expiresAt)}`;
    case "expired":
      return `Expired ${formatDateTime(invitation.expiresAt)}`;
    case "revoked":
      return invitation.revokedAt ? `Revoked ${formatDateTime(invitation.revokedAt)}` : "Revoked";
    case "used_up":
      return "Every place has been used";
  }
}

function InvitationItem({
  invitation,
  department,
  now,
}: {
  invitation: InvitationRow;
  department: { hue: string; icon: string } | undefined;
  now: Date;
}) {
  const state = invitationState(invitation, now);
  const title = invitation.departmentName ?? "The Academy";
  const percent = Math.min(100, Math.round((invitation.useCount / invitation.maxUses) * 100));
  return (
    <li
      style={{ "--dept": departmentHueVar(department?.hue ?? "") } as CSSProperties}
      className="grid grid-cols-[2.25rem_minmax(0,1fr)] items-center gap-x-3.5 gap-y-3 px-4 py-3.5 md:grid-cols-[2.25rem_minmax(0,1.3fr)_minmax(0,1fr)_auto]"
    >
      <span
        aria-hidden="true"
        className="flex size-9 items-center justify-center rounded-button bg-hover text-[var(--dept)]"
      >
        {department ? (
          <DepartmentIcon icon={department.icon} className="size-[18px]" />
        ) : (
          <UsersIcon className="size-[18px]" />
        )}
      </span>
      <div className="flex min-w-0 flex-col">
        <span className="font-semibold">{title}</span>
        <span className="text-small text-text-secondary">
          {invitation.maxUses === 1 ? "One person" : `A group of ${invitation.maxUses}`}
          {invitation.note ? ` · ${invitation.note}` : ""}
        </span>
        <span className="text-small text-text-muted">
          Created {formatDateTime(invitation.createdAt)} by {invitation.createdBy.displayName}
        </span>
      </div>
      <div className="col-start-2 flex flex-col gap-1.5 text-small text-text-secondary md:col-start-auto">
        <span className="tabular">{placesLabel(invitation.useCount, invitation.maxUses)}</span>
        <span aria-hidden="true" className="h-1.5 overflow-hidden rounded-pill bg-hover">
          <span className="block h-full rounded-pill bg-accent" style={{ width: `${percent}%` }} />
        </span>
        <span>{whenLabel(invitation, state)}</span>
      </div>
      <div className="col-start-2 flex flex-wrap items-start gap-2 md:col-start-auto md:justify-end">
        <StatusBadge tone={state === "active" ? "success" : "neutral"}>
          {state === "active" ? "Open" : INVITATION_STATE_LABELS[state]}
        </StatusBadge>
        {state === "active" ? (
          <RevokeInvitationForm invitationId={invitation.id} label={`invitation to ${title}`} />
        ) : null}
      </div>
    </li>
  );
}
