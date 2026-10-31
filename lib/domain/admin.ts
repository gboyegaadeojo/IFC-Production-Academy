/**
 * Admin and leader screens (SPEC §4, §8 "Navigation by role"). Pure rules: which sections someone
 * may open, which account changes make sense, and plain-language wording for results and history.
 * The database still decides every write (SRS-RBAC-001).
 */
import { hasCapability, hasCapabilityAnywhere, type CapabilityGrant } from "./capabilities";

export type AdminSectionKey =
  "members" | "invitations" | "curriculum" | "people" | "departments" | "audit";

/** Sidebar groups (DESIGN §3.2). An "Overview" group arrives with the admin dashboard. */
export type AdminSectionGroup = "People" | "Learning" | "System";

export type AdminSection = {
  key: AdminSectionKey;
  href: string;
  label: string;
  group: AdminSectionGroup;
};

const SECTIONS: readonly AdminSection[] = [
  { key: "members", href: "/admin/members", label: "Membership requests", group: "People" },
  { key: "people", href: "/admin/people", label: "People and roles", group: "People" },
  { key: "invitations", href: "/admin/invitations", label: "Invitations", group: "People" },
  { key: "curriculum", href: "/admin/curriculum", label: "Curriculum", group: "Learning" },
  { key: "departments", href: "/admin/departments", label: "Departments", group: "Learning" },
  { key: "audit", href: "/admin/audit", label: "Audit log", group: "System" },
];

/** Visible sections grouped for the sidebar, in order, skipping empty groups. */
export function groupAdminSections(
  sections: readonly AdminSection[],
): { group: AdminSectionGroup; sections: AdminSection[] }[] {
  const groups: { group: AdminSectionGroup; sections: AdminSection[] }[] = [];
  for (const section of sections) {
    const existing = groups.find((entry) => entry.group === section.group);
    if (existing) {
      existing.sections.push(section);
    } else {
      groups.push({ group: section.group, sections: [section] });
    }
  }
  return groups;
}

/** Whether someone may open a section. Only authorized areas are shown (SPEC §8). */
export function canOpenAdminSection(
  grants: readonly CapabilityGrant[],
  key: AdminSectionKey,
): boolean {
  switch (key) {
    case "members":
      return hasCapabilityAnywhere(grants, "member.approve");
    case "invitations":
      return hasCapabilityAnywhere(grants, "member.invite");
    case "curriculum":
      return (
        hasCapabilityAnywhere(grants, "course.draft") ||
        hasCapabilityAnywhere(grants, "course.publish")
      );
    case "people":
      return hasCapability(grants, "user.manage") || hasCapability(grants, "role.assign");
    case "departments":
      return hasCapability(grants, "department.manage");
    case "audit":
      return hasCapability(grants, "audit.view");
  }
}

export function adminSections(grants: readonly CapabilityGrant[]): AdminSection[] {
  return SECTIONS.filter((section) => canOpenAdminSection(grants, section.key));
}

// ---------------------------------------------------------------------------
// Accounts (SRS-AUTH-004)
// ---------------------------------------------------------------------------

export type AccountStatus = "active" | "suspended" | "deactivated";

export const ACCOUNT_STATUS_LABELS: Record<AccountStatus, string> = {
  active: "Active",
  suspended: "Suspended",
  deactivated: "Deactivated",
};

export type AccountStatusChange = { to: AccountStatus; label: string; needsReason: boolean };

/** The changes offered for an account. Training history is kept whatever the status. */
export function accountStatusChanges(current: AccountStatus): AccountStatusChange[] {
  switch (current) {
    case "active":
      return [
        { to: "suspended", label: "Suspend", needsReason: true },
        { to: "deactivated", label: "Deactivate", needsReason: true },
      ];
    case "suspended":
      return [
        { to: "active", label: "Reactivate", needsReason: false },
        { to: "deactivated", label: "Deactivate", needsReason: true },
      ];
    case "deactivated":
      return [{ to: "active", label: "Reactivate", needsReason: false }];
  }
}

// ---------------------------------------------------------------------------
// Errors from the database, mapped to plain language
// ---------------------------------------------------------------------------

export type AdminError =
  | "not_authorized"
  | "cannot_decide_own_membership"
  | "invalid_membership_transition"
  | "cannot_change_own_status"
  | "cannot_revoke_own_role"
  | "role_needs_user_manage"
  | "role_requires_department"
  | "role_is_organization_wide"
  | "user_role_already_revoked"
  | "duplicate"
  | "invalid_input"
  | "unknown";

const KNOWN_ERRORS: ReadonlySet<string> = new Set<AdminError>([
  "not_authorized",
  "cannot_decide_own_membership",
  "invalid_membership_transition",
  "cannot_change_own_status",
  "cannot_revoke_own_role",
  "role_needs_user_manage",
  "role_requires_department",
  "role_is_organization_wide",
  "user_role_already_revoked",
]);

/** Maps a Postgres error (code and message) to a known admin error. Never shows raw messages. */
export function toAdminError(
  error: { code?: string | null; message?: string | null } | null | undefined,
): AdminError {
  if (!error) {
    return "unknown";
  }
  if (error.message && KNOWN_ERRORS.has(error.message)) {
    return error.message as AdminError;
  }
  if (error.code === "23505") {
    return "duplicate";
  }
  if (error.code === "42501") {
    return "not_authorized";
  }
  return "unknown";
}

export function adminErrorMessage(error: AdminError): string {
  switch (error) {
    case "not_authorized":
      return "You don't have permission to do that. If you think you should, ask a Platform Admin.";
    case "cannot_decide_own_membership":
      return "You can't decide your own request. Another leader or the Production Director needs to.";
    case "invalid_membership_transition":
      return "That request has already been decided. Refresh to see where it stands.";
    case "cannot_change_own_status":
      return "You can't change your own account status. Ask another administrator.";
    case "cannot_revoke_own_role":
      return "You can't remove your own role. Ask another administrator.";
    case "role_needs_user_manage":
      return "Only a Platform Admin can grant or remove that role.";
    case "role_requires_department":
      return "Choose a department for this role.";
    case "role_is_organization_wide":
      return "This role applies across the whole ministry, so leave the department empty.";
    case "user_role_already_revoked":
      return "That role was already removed. Refresh to see the latest.";
    case "duplicate":
      return "They already have that role.";
    case "invalid_input":
      return "Something in the form wasn't right. Check it and try again.";
    case "unknown":
      return "That didn't save. Check your connection and try again.";
  }
}

// ---------------------------------------------------------------------------
// Audit log wording (SRS-AUDIT-001)
// ---------------------------------------------------------------------------

export type AuditEventSummary = {
  action: string;
  metadata: unknown;
};

function statusChange(metadata: unknown): { from: string | null; to: string | null } | null {
  if (typeof metadata !== "object" || metadata === null || !("status" in metadata)) {
    return null;
  }
  const status = (metadata as { status: unknown }).status;
  if (typeof status === "string") {
    return { from: null, to: status };
  }
  if (typeof status === "object" && status !== null) {
    const { from, to } = status as { from?: unknown; to?: unknown };
    return {
      from: typeof from === "string" ? from : null,
      to: typeof to === "string" ? to : null,
    };
  }
  return null;
}

function revoked(metadata: unknown): boolean {
  return (
    typeof metadata === "object" &&
    metadata !== null &&
    (metadata as { revoked?: unknown }).revoked === true
  );
}

function changedFields(metadata: unknown): string[] {
  if (typeof metadata !== "object" || metadata === null) {
    return [];
  }
  const changed = (metadata as { changed?: unknown }).changed;
  return Array.isArray(changed)
    ? changed.filter((key): key is string => typeof key === "string")
    : [];
}

function versionNumber(metadata: unknown): number | null {
  if (typeof metadata !== "object" || metadata === null) {
    return null;
  }
  const value = (metadata as { version_number?: unknown }).version_number;
  return typeof value === "number" ? value : null;
}

const STATUS_WORDS: Record<string, string> = {
  active: "active",
  coming_soon: "coming soon",
  inactive: "inactive",
  suspended: "suspended",
  deactivated: "deactivated",
  requested: "requested",
  declined: "declined",
  removed: "removed",
};

function word(status: string | null): string {
  return status ? (STATUS_WORDS[status] ?? status.replaceAll("_", " ")) : "unknown";
}

/** One plain sentence for an audit event, without names (the screen adds who and what). */
export function describeAuditEvent(event: AuditEventSummary): string {
  const status = statusChange(event.metadata);
  switch (event.action) {
    case "department_membership.created":
      return "Asked to join a department";
    case "department_membership.updated":
      switch (status?.to) {
        case "active":
          return "Approved a membership request";
        case "declined":
          return "Declined a membership request";
        case "removed":
          return "Removed a member";
        default:
          return "Updated a membership";
      }
    case "user_role.created":
      return "Granted a role";
    case "user_role.updated":
      return revoked(event.metadata) ? "Removed a role" : "Updated a role";
    case "profile.created":
      return "Signed in for the first time";
    case "profile.updated":
      if (status) {
        return `Changed account status from ${word(status.from)} to ${word(status.to)}`;
      }
      return changedFields(event.metadata).includes("display_name")
        ? "Changed a display name"
        : "Updated a profile";
    case "invitation.created":
      return "Created an invitation";
    case "invitation.updated":
      if (revoked(event.metadata)) {
        return "Revoked an invitation";
      }
      return changedFields(event.metadata).includes("use_count")
        ? "An invitation place was used"
        : "Updated an invitation";
    case "invitation_acceptance.created":
      return "Accepted an invitation";
    case "course.created":
      return "Created a course";
    case "course.updated":
      return changedFields(event.metadata).includes("archived_at")
        ? "Archived or brought back a course"
        : "Updated a course";
    case "course_version.created":
      return "Started editing a course";
    case "course_version.updated": {
      const number = versionNumber(event.metadata);
      switch (status?.to) {
        case "published":
          return number ? `Published version ${number} of a course` : "Published a course";
        case "pending_review":
          return "Submitted a course for review";
        case "draft":
          return "Returned a course for changes";
        case "superseded":
          return number
            ? `Version ${number} of a course was replaced`
            : "A course version was replaced";
        case "archived":
          return "Archived a course";
        default:
          return "Updated a course version";
      }
    }
    case "level.updated":
      return "Edited a level";
    case "department.created":
      return "Created a department";
    case "department.updated":
      if (status) {
        return `Changed department status from ${word(status.from)} to ${word(status.to)}`;
      }
      return "Edited a department";
    default:
      return event.action.replace(".", " ").replaceAll("_", " ");
  }
}

// ---------------------------------------------------------------------------
// Dates (stored in UTC, shown in Winnipeg time)
// ---------------------------------------------------------------------------

const DATE_TIME = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Winnipeg",
  dateStyle: "medium",
  timeStyle: "short",
});

export function formatDateTime(iso: string): string {
  return DATE_TIME.format(new Date(iso));
}
