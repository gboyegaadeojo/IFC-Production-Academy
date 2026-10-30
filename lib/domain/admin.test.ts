import { describe, expect, it } from "vitest";
import {
  accountStatusChanges,
  adminErrorMessage,
  adminSections,
  canOpenAdminSection,
  describeAuditEvent,
  formatDateTime,
  toAdminError,
} from "./admin";
import type { CapabilityGrant } from "./capabilities";

const CAMERA = "b7ba9dae-cab5-43e0-a996-8ae9d2436855";

const volunteer: CapabilityGrant[] = [];
const cameraLeader: CapabilityGrant[] = [
  { capability: "member.approve", departmentId: CAMERA },
  { capability: "member.invite", departmentId: CAMERA },
];
const director: CapabilityGrant[] = [
  { capability: "member.approve", departmentId: null },
  { capability: "role.assign", departmentId: null },
  { capability: "audit.view", departmentId: null },
];
const platformAdmin: CapabilityGrant[] = [
  { capability: "department.manage", departmentId: null },
  { capability: "user.manage", departmentId: null },
  { capability: "role.assign", departmentId: null },
  { capability: "audit.view", departmentId: null },
];

describe("adminSections", () => {
  it("shows nothing to a volunteer", () => {
    expect(adminSections(volunteer)).toEqual([]);
  });

  it("shows a department leader membership requests and invitations", () => {
    expect(adminSections(cameraLeader).map((s) => s.key)).toEqual(["members", "invitations"]);
  });

  it("shows Curriculum to anyone who drafts or publishes for a department", () => {
    const drafter: CapabilityGrant[] = [{ capability: "course.draft", departmentId: CAMERA }];
    expect(adminSections(drafter).map((s) => s.key)).toEqual(["curriculum"]);
  });

  it("shows the Production Director members, people, and the audit log", () => {
    expect(adminSections(director).map((s) => s.key)).toEqual(["members", "people", "audit"]);
  });

  it("follows SPEC §4: a Platform Admin does not approve members", () => {
    expect(adminSections(platformAdmin).map((s) => s.key)).toEqual([
      "people",
      "departments",
      "audit",
    ]);
  });

  it("does not let a department-scoped grant open organization-wide sections", () => {
    const scopedRoleAssign: CapabilityGrant[] = [
      { capability: "role.assign", departmentId: CAMERA },
    ];
    expect(canOpenAdminSection(scopedRoleAssign, "people")).toBe(false);
  });
});

describe("accountStatusChanges", () => {
  it("offers suspend and deactivate for an active account, both with a reason", () => {
    expect(accountStatusChanges("active")).toEqual([
      { to: "suspended", label: "Suspend", needsReason: true },
      { to: "deactivated", label: "Deactivate", needsReason: true },
    ]);
  });

  it("offers reactivation without a reason", () => {
    expect(accountStatusChanges("deactivated")).toEqual([
      { to: "active", label: "Reactivate", needsReason: false },
    ]);
    expect(accountStatusChanges("suspended")[0]).toEqual({
      to: "active",
      label: "Reactivate",
      needsReason: false,
    });
  });
});

describe("toAdminError", () => {
  it("recognises the database's named errors", () => {
    expect(toAdminError({ code: "42501", message: "cannot_revoke_own_role" })).toBe(
      "cannot_revoke_own_role",
    );
    expect(toAdminError({ code: "P0001", message: "invalid_membership_transition" })).toBe(
      "invalid_membership_transition",
    );
  });

  it("treats row-level security failures as not authorized", () => {
    expect(
      toAdminError({ code: "42501", message: "new row violates row-level security policy" }),
    ).toBe("not_authorized");
  });

  it("treats unique violations as duplicates", () => {
    expect(toAdminError({ code: "23505", message: "duplicate key value" })).toBe("duplicate");
  });

  it("never passes unknown database messages through", () => {
    const error = toAdminError({ code: "XX000", message: "internal detail" });
    expect(error).toBe("unknown");
    expect(adminErrorMessage(error)).not.toContain("internal detail");
  });
});

describe("describeAuditEvent", () => {
  it("describes membership decisions", () => {
    expect(
      describeAuditEvent({
        action: "department_membership.updated",
        metadata: { status: { from: "requested", to: "active" } },
      }),
    ).toBe("Approved a membership request");
    expect(
      describeAuditEvent({
        action: "department_membership.updated",
        metadata: { status: { from: "active", to: "removed" } },
      }),
    ).toBe("Removed a member");
  });

  it("describes role grants and removals", () => {
    expect(describeAuditEvent({ action: "user_role.created", metadata: {} })).toBe(
      "Granted a role",
    );
    expect(describeAuditEvent({ action: "user_role.updated", metadata: { revoked: true } })).toBe(
      "Removed a role",
    );
  });

  it("describes status changes in words", () => {
    expect(
      describeAuditEvent({
        action: "department.updated",
        metadata: { status: { from: "coming_soon", to: "active" } },
      }),
    ).toBe("Changed department status from coming soon to active");
    expect(
      describeAuditEvent({
        action: "profile.updated",
        metadata: { status: { from: "active", to: "suspended" } },
      }),
    ).toBe("Changed account status from active to suspended");
  });

  it("describes invitations", () => {
    expect(describeAuditEvent({ action: "invitation.created", metadata: {} })).toBe(
      "Created an invitation",
    );
    expect(
      describeAuditEvent({
        action: "invitation.updated",
        metadata: { changed: ["revoked_at", "revoked_by"], revoked: true },
      }),
    ).toBe("Revoked an invitation");
    expect(describeAuditEvent({ action: "invitation_acceptance.created", metadata: {} })).toBe(
      "Accepted an invitation",
    );
  });

  it("describes publishing with the version number", () => {
    expect(
      describeAuditEvent({
        action: "course_version.updated",
        metadata: { status: { from: "draft", to: "published" }, version_number: 2 },
      }),
    ).toBe("Published version 2 of a course");
  });

  it("falls back to readable words for unknown actions", () => {
    expect(describeAuditEvent({ action: "course_version.published", metadata: null })).toBe(
      "course version published",
    );
  });
});

describe("formatDateTime", () => {
  it("shows UTC timestamps in Winnipeg time", () => {
    // 18:00 UTC on 30 October 2026 is 1:00 p.m. in Winnipeg (CDT, UTC-5).
    expect(formatDateTime("2026-10-30T18:00:00Z")).toMatch(/1:00/);
  });
});
