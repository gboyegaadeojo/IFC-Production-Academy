import "server-only";
import { createSupabaseServerClient } from "@/lib/data/supabase/server";
import { toAdminError, type AccountStatus } from "@/lib/domain/admin";
import { peopleById, personFor, type AdminResult, type PersonSummary } from "./shared";

export type RoleOption = {
  id: string;
  key: string;
  name: string;
  description: string;
  departmentScoped: boolean;
};

export type DepartmentOption = { id: string; name: string };

export type RoleGrant = {
  id: string;
  roleId: string;
  roleName: string;
  departmentId: string | null;
  departmentName: string | null;
  grantedAt: string;
  grantedBy: PersonSummary | null;
  revokedAt: string | null;
  revokedBy: PersonSummary | null;
};

export type PersonRow = PersonSummary & {
  status: AccountStatus;
  joinedAt: string;
  roles: { roleName: string; departmentName: string | null }[];
};

export type PersonDetail = PersonSummary & {
  status: AccountStatus;
  statusReason: string | null;
  statusChangedAt: string | null;
  statusChangedBy: PersonSummary | null;
  joinedAt: string;
  roles: RoleGrant[];
};

async function loadRolesAndDepartments(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
) {
  const [roles, departments] = await Promise.all([
    supabase.from("roles").select("id, key, name, description, department_scoped").order("name"),
    supabase.from("departments").select("id, name, sort_order").order("sort_order"),
  ]);
  if (roles.error) {
    throw new Error("Could not load roles", { cause: roles.error.code });
  }
  if (departments.error) {
    throw new Error("Could not load departments", { cause: departments.error.code });
  }
  return {
    roles: roles.data.map((row): RoleOption => ({
      id: row.id,
      key: row.key,
      name: row.name,
      description: row.description,
      departmentScoped: row.department_scoped,
    })),
    departments: departments.data.map((row): DepartmentOption => ({ id: row.id, name: row.name })),
  };
}

/** Everyone the caller may see, with their current roles (SPEC §8 "Users and Roles"). */
export async function listPeople(): Promise<PersonRow[]> {
  const supabase = await createSupabaseServerClient();
  const [profiles, grants, lookups] = await Promise.all([
    supabase.from("profiles").select("id, status, created_at").order("display_name"),
    supabase.from("user_roles").select("user_id, role_id, department_id").is("revoked_at", null),
    loadRolesAndDepartments(supabase),
  ]);
  if (profiles.error) {
    throw new Error("Could not load people", { cause: profiles.error.code });
  }
  if (grants.error) {
    throw new Error("Could not load roles", { cause: grants.error.code });
  }

  const people = await peopleById(
    supabase,
    profiles.data.map((row) => row.id),
  );
  const roleName = new Map(lookups.roles.map((role) => [role.id, role.name]));
  const departmentName = new Map(lookups.departments.map((d) => [d.id, d.name]));

  return profiles.data.map((row) => ({
    ...personFor(people, row.id),
    status: row.status,
    joinedAt: row.created_at,
    roles: grants.data
      .filter((grant) => grant.user_id === row.id)
      .map((grant) => ({
        roleName: roleName.get(grant.role_id) ?? "Unknown role",
        departmentName: grant.department_id
          ? (departmentName.get(grant.department_id) ?? "Unknown department")
          : null,
      })),
  }));
}

/** One person's account and full role history, plus what can be granted. */
export async function getPerson(userId: string): Promise<{
  person: PersonDetail;
  roles: RoleOption[];
  departments: DepartmentOption[];
} | null> {
  const supabase = await createSupabaseServerClient();
  const [profile, grants, lookups] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, status, status_reason, status_changed_at, status_changed_by, created_at")
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("user_roles")
      .select("id, role_id, department_id, granted_at, granted_by, revoked_at, revoked_by")
      .eq("user_id", userId)
      .order("granted_at", { ascending: false }),
    loadRolesAndDepartments(supabase),
  ]);
  if (profile.error) {
    throw new Error("Could not load person", { cause: profile.error.code });
  }
  if (grants.error) {
    throw new Error("Could not load roles", { cause: grants.error.code });
  }
  if (!profile.data) {
    return null;
  }

  const actorIds = grants.data.flatMap((grant) =>
    [grant.granted_by, grant.revoked_by].filter((id): id is string => id !== null),
  );
  if (profile.data.status_changed_by) {
    actorIds.push(profile.data.status_changed_by);
  }
  const people = await peopleById(supabase, [userId, ...actorIds]);
  const optional = (id: string | null) => (id ? personFor(people, id) : null);
  const roleName = new Map(lookups.roles.map((role) => [role.id, role.name]));
  const departmentName = new Map(lookups.departments.map((d) => [d.id, d.name]));

  return {
    person: {
      ...personFor(people, userId),
      status: profile.data.status,
      statusReason: profile.data.status_reason,
      statusChangedAt: profile.data.status_changed_at,
      statusChangedBy: optional(profile.data.status_changed_by),
      joinedAt: profile.data.created_at,
      roles: grants.data.map((grant) => ({
        id: grant.id,
        roleId: grant.role_id,
        roleName: roleName.get(grant.role_id) ?? "Unknown role",
        departmentId: grant.department_id,
        departmentName: grant.department_id
          ? (departmentName.get(grant.department_id) ?? "Unknown department")
          : null,
        grantedAt: grant.granted_at,
        grantedBy: optional(grant.granted_by),
        revokedAt: grant.revoked_at,
        revokedBy: optional(grant.revoked_by),
      })),
    },
    ...lookups,
  };
}

/** SRS-RBAC-002. The database checks role.assign, department scope, and escalation rules. */
export async function grantRole(
  userId: string,
  roleId: string,
  departmentId: string | null,
): Promise<AdminResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("user_roles")
    .insert({ user_id: userId, role_id: roleId, department_id: departmentId });
  return error ? { ok: false, error: toAdminError(error) } : { ok: true };
}

/** Rows are never deleted; revoking stamps who and when (SRS-AUTH-007). */
export async function revokeRole(userRoleId: string): Promise<AdminResult> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("user_roles")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", userRoleId)
    .is("revoked_at", null)
    .select("id");
  if (error) {
    return { ok: false, error: toAdminError(error) };
  }
  // No row back means RLS hid it or it was already revoked.
  return data.length === 1 ? { ok: true } : { ok: false, error: "user_role_already_revoked" };
}

/** SRS-AUTH-004. Suspend, reactivate, or deactivate; history stays. */
export async function setAccountStatus(
  userId: string,
  status: AccountStatus,
  reason: string | null,
): Promise<AdminResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_account_status", {
    p_user_id: userId,
    p_status: status,
    p_reason: reason,
  });
  return error ? { ok: false, error: toAdminError(error) } : { ok: true };
}
