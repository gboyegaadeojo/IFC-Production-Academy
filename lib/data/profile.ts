import "server-only";
import { createSupabaseServerClient } from "@/lib/data/supabase/server";
import type { MembershipStatus } from "@/lib/domain/departments";

export type MyProfile = {
  displayName: string;
  email: string | null;
  joinedAt: string;
  roles: { id: string; roleName: string; departmentName: string | null }[];
  memberships: {
    id: string;
    departmentName: string;
    status: MembershipStatus;
    updatedAt: string;
  }[];
};

/** The signed-in person's own profile, roles, and memberships (SRS-AUTH-006). */
export async function getMyProfile(userId: string): Promise<MyProfile | null> {
  const supabase = await createSupabaseServerClient();
  const [profile, email, grants, memberships, roles, departments] = await Promise.all([
    supabase.from("profiles").select("display_name, created_at").eq("id", userId).maybeSingle(),
    supabase.rpc("profile_emails", { p_user_ids: [userId] }),
    supabase
      .from("user_roles")
      .select("id, role_id, department_id")
      .eq("user_id", userId)
      .is("revoked_at", null),
    supabase
      .from("department_memberships")
      .select("id, department_id, status, updated_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false }),
    supabase.from("roles").select("id, name"),
    supabase.from("departments").select("id, name"),
  ]);
  for (const result of [profile, email, grants, memberships, roles, departments]) {
    if (result.error) {
      throw new Error("Could not load your profile", { cause: result.error.code });
    }
  }
  if (!profile.data) {
    return null;
  }

  const roleName = new Map((roles.data ?? []).map((row) => [row.id, row.name]));
  const departmentName = new Map((departments.data ?? []).map((row) => [row.id, row.name]));

  // One row per department: the most recent membership record.
  const seen = new Set<string>();
  const latest = (memberships.data ?? []).filter((row) => {
    if (seen.has(row.department_id)) {
      return false;
    }
    seen.add(row.department_id);
    return true;
  });

  return {
    displayName: profile.data.display_name,
    email: email.data?.[0]?.email ?? null,
    joinedAt: profile.data.created_at,
    roles: (grants.data ?? []).map((row) => ({
      id: row.id,
      roleName: roleName.get(row.role_id) ?? "Unknown role",
      departmentName: row.department_id ? (departmentName.get(row.department_id) ?? null) : null,
    })),
    memberships: latest.map((row) => ({
      id: row.id,
      departmentName: departmentName.get(row.department_id) ?? "A department",
      status: row.status,
      updatedAt: row.updated_at,
    })),
  };
}

/** Only display_name and avatar_url are writable by the person (column grants and RLS). */
export async function updateMyDisplayName(userId: string, displayName: string): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("profiles")
    .update({ display_name: displayName })
    .eq("id", userId)
    .select("id");
  return !error && data.length === 1;
}
