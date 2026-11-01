import "server-only";
import { createSupabaseServerClient } from "@/lib/data/supabase/server";
import { hasCapability, type Capability, type CapabilityGrant } from "@/lib/domain/capabilities";
import { toTeamError, type Position, type TeamError, type TeamPerson } from "@/lib/domain/teams";

// Position teams (decision record 9). The database checks team.manage on every read and write.

export type TeamResult = { ok: true } | { ok: false; error: TeamError };

export type TeamDepartment = { id: string; name: string; hue: string; icon: string };

/** Departments where this person holds a capability (by default, running the teams), in order. */
export async function getTeamDepartments(
  grants: readonly CapabilityGrant[],
  capability: Capability = "team.manage",
): Promise<TeamDepartment[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("departments")
    .select("id, name, hue, icon, status, sort_order")
    .neq("status", "inactive")
    .order("sort_order");
  if (error) {
    throw new Error("Could not load departments", { cause: error.code });
  }
  return data
    .filter((d) => hasCapability(grants, capability, d.id))
    .map((d) => ({ id: d.id, name: d.name, hue: d.hue, icon: d.icon }));
}

/** The department's positions (serving roles), and everyone with where they stand on each. */
export async function getServingTeam(
  departmentId: string,
): Promise<{ positions: Position[]; people: TeamPerson[] }> {
  const supabase = await createSupabaseServerClient();
  const [roles, overview] = await Promise.all([
    supabase
      .from("serving_roles")
      .select("id, name, leads_service")
      .eq("department_id", departmentId)
      .is("archived_at", null)
      .order("name"),
    supabase.rpc("serving_team_overview", { p_department_id: departmentId }),
  ]);
  if (roles.error) {
    throw new Error("Could not load positions", { cause: roles.error.code });
  }
  if (overview.error) {
    throw new Error("Could not load the teams", { cause: overview.error.code });
  }
  return {
    positions: roles.data.map((role) => ({
      id: role.id,
      name: role.name,
      leadsService: role.leads_service,
    })),
    people: overview.data.map((row) => ({
      id: row.user_id,
      name: row.display_name,
      isMember: row.is_member,
      teamRoleIds: row.team_role_ids,
      trainedRoleIds: row.trained_role_ids,
    })),
  };
}

export async function addToServingTeam(roleId: string, userId: string): Promise<TeamResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("add_to_serving_team", {
    p_role_id: roleId,
    p_user_id: userId,
  });
  return error ? { ok: false, error: toTeamError(error) } : { ok: true };
}

export async function removeFromServingTeam(roleId: string, userId: string): Promise<TeamResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("remove_from_serving_team", {
    p_role_id: roleId,
    p_user_id: userId,
  });
  return error ? { ok: false, error: toTeamError(error) } : { ok: true };
}
