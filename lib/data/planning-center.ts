import "server-only";
import { createSupabaseServerClient } from "@/lib/data/supabase/server";

// Planning Center as the scheduler (decision record 9, revised 2026-10-31). The scheduled job
// writes the synced rows; these read them for the admin page and set the position links.

export type SchedulingSource = "academy" | "planning_center";

/** Who schedules: Planning Center (the default) or the Academy's own scheduler. */
export async function getSchedulingSource(): Promise<SchedulingSource> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("scheduling_source");
  if (error) {
    throw new Error("Could not read the scheduling setting", { cause: error.code });
  }
  return data === "academy" ? "academy" : "planning_center";
}

export async function setSchedulingSource(source: SchedulingSource): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_scheduling_source", { p_source: source });
  return !error;
}

export type SyncRun = { finishedAt: string; counts: Record<string, number> };

export type PcoMapping = {
  serviceTypes: {
    id: string;
    name: string;
    teams: {
      id: string;
      name: string;
      roleId: string | null;
      positions: { id: string; name: string; roleId: string | null }[];
    }[];
  }[];
  lastRun: SyncRun | null;
  withoutAccount: string[];
};

/** Planning Center's service types, teams, and positions as last synced, with their links. */
export async function getPcoMapping(): Promise<PcoMapping> {
  const supabase = await createSupabaseServerClient();
  const [types, teams, positions, links, runs, people] = await Promise.all([
    supabase.from("pco_service_types").select("id, name").order("name"),
    supabase.from("pco_teams").select("id, service_type_id, name").order("name"),
    supabase.from("pco_positions").select("id, team_id, name").order("name"),
    supabase.from("pco_links").select("pco_team_id, pco_position_id, role_id"),
    supabase
      .from("pco_sync_runs")
      .select("finished_at, counts")
      .order("finished_at", { ascending: false })
      .limit(1),
    supabase.from("pco_people").select("display_name").is("user_id", null).order("display_name"),
  ]);
  if (types.error || teams.error || positions.error || links.error || runs.error || people.error) {
    throw new Error("Could not load Planning Center", {
      cause: (
        types.error ??
        teams.error ??
        positions.error ??
        links.error ??
        runs.error ??
        people.error
      )?.code,
    });
  }
  const link = (teamId: string, positionId: string | null) =>
    links.data.find((l) => l.pco_team_id === teamId && l.pco_position_id === positionId)?.role_id ??
    null;
  const run = runs.data[0];
  return {
    serviceTypes: types.data.map((type) => ({
      id: type.id,
      name: type.name,
      teams: teams.data
        .filter((team) => team.service_type_id === type.id)
        .map((team) => ({
          id: team.id,
          name: team.name,
          roleId: link(team.id, null),
          positions: positions.data
            .filter((p) => p.team_id === team.id)
            .map((p) => ({ id: p.id, name: p.name, roleId: link(team.id, p.id) })),
        })),
    })),
    lastRun: run
      ? { finishedAt: run.finished_at, counts: run.counts as Record<string, number> }
      : null,
    withoutAccount: people.data.map((p) => p.display_name).filter(Boolean),
  };
}

export async function setPcoLink(
  teamId: string,
  positionId: string | null,
  roleId: string | null,
): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_pco_link", {
    p_team_id: teamId,
    p_position_id: positionId,
    p_role_id: roleId,
  });
  return !error;
}
