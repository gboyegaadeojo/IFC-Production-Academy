/**
 * Admin and leader screens (SPEC §4, §8 "Navigation by role"). Pure rules: which sections someone
 * may open, which account changes make sense, and plain-language wording for results and history.
 * The database still decides every write (SRS-RBAC-001).
 */
import { hasCapability, hasCapabilityAnywhere, type CapabilityGrant } from "./capabilities";

export type AdminSectionKey =
  | "overview"
  | "members"
  | "invitations"
  | "curriculum"
  | "sops"
  | "competencies"
  | "assessments"
  | "schedule"
  | "teams"
  | "checklists"
  | "checklist-activity"
  | "checklist-history"
  | "checklist-hidden"
  | "checklist-settings"
  | "planning-center"
  | "reports"
  | "mentoring"
  | "people"
  | "departments"
  | "audit"
  | "onboarding"
  | "onboarding-people"
  | "onboarding-follow-ups";

/**
 * Sidebar groups (DESIGN §3.2), one per part of the ministry's tools, so an admin knows where a
 * setting lives (G, 2026-11-01).
 */
export const ADMIN_GROUPS = [
  "Overview",
  "Checklists",
  "Services & Scheduling",
  "Training Academy",
  "People & Teams",
  "System & Settings",
] as const;
export type AdminSectionGroup = (typeof ADMIN_GROUPS)[number];

export type AdminGroupIcon =
  "dashboard" | "list-checks" | "calendar-range" | "graduation-cap" | "users" | "settings";

/**
 * Whether the admin sidebar is icons only on this device ("collapsed" or "expanded"). Here, not
 * in the client component, so the server layout can read it.
 */
export const ADMIN_SIDEBAR_COOKIE = "admin_sidebar";

/** Each group's icon in the sidebar (components/ui/icons.tsx). */
export const ADMIN_GROUP_ICONS: Record<AdminSectionGroup, AdminGroupIcon> = {
  Overview: "dashboard",
  Checklists: "list-checks",
  "Services & Scheduling": "calendar-range",
  "Training Academy": "graduation-cap",
  "People & Teams": "users",
  "System & Settings": "settings",
};

export type AdminSection = {
  key: AdminSectionKey;
  href: string;
  label: string;
  group: AdminSectionGroup;
};

const SECTIONS: readonly AdminSection[] = [
  { key: "checklists", href: "/admin/checklists", label: "Task lists", group: "Checklists" },
  {
    key: "checklist-activity",
    href: "/admin/checklists/activity",
    label: "Activity log",
    group: "Checklists",
  },
  {
    key: "checklist-history",
    href: "/admin/checklists/history",
    label: "Service history",
    group: "Checklists",
  },
  {
    key: "checklist-hidden",
    href: "/admin/checklists/hidden",
    label: "Hidden items",
    group: "Checklists",
  },
  {
    key: "checklist-settings",
    href: "/admin/checklists/settings",
    label: "Checklist settings",
    group: "Checklists",
  },
  {
    key: "planning-center",
    href: "/admin/planning-center",
    label: "Planning Center",
    group: "Services & Scheduling",
  },
  { key: "teams", href: "/admin/teams", label: "Serving teams", group: "Services & Scheduling" },
  { key: "schedule", href: "/admin/schedule", label: "Schedule", group: "Services & Scheduling" },
  { key: "curriculum", href: "/admin/curriculum", label: "Curriculum", group: "Training Academy" },
  { key: "sops", href: "/admin/sops", label: "SOP library", group: "Training Academy" },
  {
    key: "assessments",
    href: "/admin/assessments",
    label: "Assessments",
    group: "Training Academy",
  },
  {
    key: "competencies",
    href: "/admin/competencies",
    label: "Competencies and roles",
    group: "Training Academy",
  },
  {
    key: "members",
    href: "/admin/members",
    label: "Membership requests",
    group: "Training Academy",
  },
  { key: "mentoring", href: "/admin/mentoring", label: "Mentoring", group: "Training Academy" },
  {
    key: "departments",
    href: "/admin/departments",
    label: "Departments",
    group: "Training Academy",
  },
  { key: "reports", href: "/admin/reports", label: "Reports", group: "Training Academy" },
  { key: "people", href: "/admin/people", label: "People and roles", group: "People & Teams" },
  {
    key: "onboarding",
    href: "/admin/onboarding",
    label: "Onboarding pathways",
    group: "People & Teams",
  },
  {
    key: "onboarding-people",
    href: "/admin/onboarding/people",
    label: "People in pathways",
    group: "People & Teams",
  },
  {
    key: "onboarding-follow-ups",
    href: "/admin/onboarding/follow-ups",
    label: "Follow-ups",
    group: "People & Teams",
  },
  { key: "invitations", href: "/admin/invitations", label: "Invitations", group: "People & Teams" },
  { key: "audit", href: "/admin/audit", label: "Audit log", group: "System & Settings" },
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
    case "overview":
      return SECTIONS.some((section) => canOpenAdminSection(grants, section.key));
    case "members":
      return hasCapabilityAnywhere(grants, "member.approve");
    case "invitations":
      return hasCapabilityAnywhere(grants, "member.invite");
    case "curriculum":
    case "sops":
      return (
        hasCapabilityAnywhere(grants, "course.draft") ||
        hasCapabilityAnywhere(grants, "course.publish")
      );
    case "schedule":
      return hasCapabilityAnywhere(grants, "schedule.manage");
    case "teams":
      return hasCapabilityAnywhere(grants, "team.manage");
    case "checklists":
    case "checklist-activity":
    case "checklist-history":
    case "checklist-hidden":
      return hasCapabilityAnywhere(grants, "checklist.manage");
    case "checklist-settings":
      // Church-wide checklist managers only, as in the database.
      return hasCapability(grants, "checklist.manage");
    case "planning-center":
      return (
        hasCapabilityAnywhere(grants, "team.manage") ||
        hasCapabilityAnywhere(grants, "schedule.manage")
      );
    case "reports":
      return hasCapabilityAnywhere(grants, "report.view");
    case "mentoring":
      return hasCapabilityAnywhere(grants, "mentoring.assign");
    case "assessments":
      return (
        hasCapabilityAnywhere(grants, "assessment.record") ||
        hasCapabilityAnywhere(grants, "competency.approve")
      );
    case "competencies":
      return (
        hasCapabilityAnywhere(grants, "competency.approve") ||
        hasCapabilityAnywhere(grants, "assessment.record") ||
        hasCapabilityAnywhere(grants, "report.view")
      );
    case "people":
      return hasCapability(grants, "user.manage") || hasCapability(grants, "role.assign");
    case "departments":
      return hasCapability(grants, "department.manage");
    case "audit":
      return hasCapability(grants, "audit.view");
    case "onboarding":
    case "onboarding-people":
    case "onboarding-follow-ups":
      return hasCapabilityAnywhere(grants, "onboarding.manage");
  }
}

/** The working sections someone may open (not the dashboard). */
export function adminSections(grants: readonly CapabilityGrant[]): AdminSection[] {
  return SECTIONS.filter((section) => canOpenAdminSection(grants, section.key));
}

const DASHBOARD: AdminSection = {
  key: "overview",
  href: "/admin",
  label: "Dashboard",
  group: "Overview",
};

/** Sidebar navigation: the dashboard first, then grouped sections. Empty for people with none. */
export function adminNavigation(
  grants: readonly CapabilityGrant[],
): { group: AdminSectionGroup; sections: AdminSection[] }[] {
  const sections = adminSections(grants);
  return sections.length === 0 ? [] : groupAdminSections([DASHBOARD, ...sections]);
}

/** Whether a sidebar link is the current page. The dashboard matches only itself. */
export function isCurrentSection(section: AdminSection, pathname: string): boolean {
  if (section.key === "overview") {
    return pathname === section.href;
  }
  return pathname === section.href || pathname.startsWith(`${section.href}/`);
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
