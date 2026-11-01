/**
 * Named capabilities (SPEC §4, SRS-RBAC-005). Roles grant these, optionally scoped to a department.
 * The database is the source of truth; this list exists so code can't check a misspelled key.
 */
export const CAPABILITIES = [
  "department.manage",
  "member.approve",
  "member.invite",
  "user.manage",
  "role.assign",
  "audit.view",
  "course.draft",
  "course.publish",
  "assessment.record",
  "competency.approve",
  "schedule.manage",
  "schedule.override",
  "team.manage",
  "checklist.manage",
  "mentoring.assign",
  "mentoring.feedback",
  "mentoring.private_notes",
  "report.view",
  "report.export",
  "onboarding.manage",
] as const;

export type Capability = (typeof CAPABILITIES)[number];

export type CapabilityGrant = {
  capability: string;
  /** null means the grant applies across the whole organization. */
  departmentId: string | null;
};

/**
 * Mirrors `private.has_capability` in the database:
 * - without a department, only organization-wide grants count;
 * - with a department, organization-wide grants and grants for that department count.
 *
 * Use it to shape the UI and to fail fast in server actions. The database policies still decide.
 */
export function hasCapability(
  grants: readonly CapabilityGrant[],
  capability: Capability,
  departmentId: string | null = null,
): boolean {
  return grants.some(
    (grant) =>
      grant.capability === capability &&
      (grant.departmentId === null || grant.departmentId === departmentId),
  );
}

/** True if the person holds the capability anywhere: useful for showing a Lead tab. */
export function hasCapabilityAnywhere(
  grants: readonly CapabilityGrant[],
  capability: Capability,
): boolean {
  return grants.some((grant) => grant.capability === capability);
}
