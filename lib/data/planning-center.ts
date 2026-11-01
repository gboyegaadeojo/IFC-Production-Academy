import "server-only";
import { z } from "zod";
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

// ---------------------------------------------------------------------------
// Who is scheduled in a position that isn't linked (checklist app US-15, C39)
// ---------------------------------------------------------------------------

export type UnlinkedPlace = {
  eventId: string;
  eventTitle: string;
  startsAt: string;
  personName: string;
  teamName: string;
  positionName: string;
};

/**
 * Upcoming services' places whose Planning Center position isn't linked to an Academy position,
 * so those people won't see their checklist. Empty for anyone who may not see them.
 */
export async function getUnlinkedPlaces(eventId?: string): Promise<UnlinkedPlace[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc(
    "pco_unlinked_places",
    eventId ? { p_event_id: eventId } : {},
  );
  if (error) {
    if (error.code === "42501") {
      return [];
    }
    throw new Error("Could not load unlinked positions", { cause: error.code });
  }
  return data.map((row) => ({
    eventId: row.event_id,
    eventTitle: row.event_title,
    startsAt: row.starts_at,
    personName: row.person_name,
    teamName: row.team_name,
    positionName: row.position_name,
  }));
}

// ---------------------------------------------------------------------------
// Refresh from Planning Center (checklist app US-15, C29)
// ---------------------------------------------------------------------------

export type RefreshResult = "requested" | "too_soon" | "not_authorized" | "not_set_up" | "failed";

/**
 * Records the request (at most one every two minutes, audited), then asks GitHub to run the
 * Planning Center sync workflow now. The Planning Center token stays in Actions secrets.
 */
export async function requestPcoRefresh(): Promise<RefreshResult> {
  const config = dispatchConfig();
  if (!config) {
    return "not_set_up";
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("request_pco_refresh");
  if (error) {
    return error.message === "too_soon"
      ? "too_soon"
      : error.code === "42501"
        ? "not_authorized"
        : "failed";
  }
  return (await dispatchSync(config)) ? "requested" : "failed";
}

export function pcoRefreshEnabled(): boolean {
  return dispatchConfig() !== null;
}

/** When someone last asked for a refresh, to show while the run is under way. */
export async function getLastRefreshRequest(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("pco_refresh_requests")
    .select("requested_at")
    .order("requested_at", { ascending: false })
    .limit(1);
  if (error) {
    throw new Error("Could not load refresh requests", { cause: error.code });
  }
  return data[0]?.requested_at ?? null;
}

// A fine-grained GitHub token for this repository only, with Actions: read and write, set as a
// Cloudflare secret (docs/runbooks/scheduling.md). Never logged. Until it's set, the button is off.
const dispatchSchema = z.object({
  GITHUB_DISPATCH_TOKEN: z.string().min(20),
  GITHUB_DISPATCH_REPO: z
    .string()
    .regex(/^[\w.-]+\/[\w.-]+$/)
    .default("gboyegaadeojo/IFC-Production-Academy"),
});

type DispatchConfig = { token: string; repo: string };

function dispatchConfig(): DispatchConfig | null {
  const result = dispatchSchema.safeParse({
    GITHUB_DISPATCH_TOKEN: process.env.GITHUB_DISPATCH_TOKEN,
    GITHUB_DISPATCH_REPO: process.env.GITHUB_DISPATCH_REPO || undefined,
  });
  return result.success
    ? { token: result.data.GITHUB_DISPATCH_TOKEN, repo: result.data.GITHUB_DISPATCH_REPO }
    : null;
}

async function dispatchSync({ token, repo }: DispatchConfig): Promise<boolean> {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${repo}/actions/workflows/planning-center.yml/dispatches`,
      {
        method: "POST",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "ifc-production-academy",
        },
        body: JSON.stringify({ ref: "main" }),
        signal: AbortSignal.timeout(10_000),
      },
    );
    return response.status === 204;
  } catch {
    return false;
  }
}
