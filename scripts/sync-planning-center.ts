/**
 * Copies the schedule from Planning Center Services into the Academy (decision record 9, revised
 * 2026-10-31). Run by .github/workflows/planning-center.yml with Node's built-in TypeScript
 * support.
 *
 * Reads Planning Center with the church's read-only Personal Access Token (the same one the Sunday
 * Pre-Service Checklist app uses) and applies it with sync_planning_center(), using the Supabase
 * service role. Both exist only as GitHub Actions secrets. It only ever sends GET requests to
 * Planning Center. Logs counts only, never names, emails, or ids (CLAUDE.md "Actions logs must
 * never contain data"). Without the token it does nothing.
 */
import {
  isLive,
  mapBlockout,
  mapMembers,
  mapPerson,
  mapRoster,
  mapTeams,
  planTitle,
  planWindow,
  relatedId,
  type PcoPayload,
  type Resource,
} from "../lib/domain/planning-center.ts";
import { supabaseKeyHeaders } from "../lib/domain/supabase-keys.ts";

const API = "https://api.planningcenteronline.com";
const DAYS_AHEAD = 60;
const env = (name: string) => process.env[name]?.trim() ?? "";
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

class NotFound extends Error {}

let requests = 0;

/** One GET, politely: Planning Center allows about 100 requests every 20 seconds. */
async function get(
  url: string,
  authorization: string,
): Promise<{
  data: Resource | Resource[];
  included?: Resource[];
  links?: { next?: string | null };
}> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await sleep(220);
    requests += 1;
    const response = await fetch(url, {
      method: "GET",
      headers: { Authorization: authorization, Accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
    });
    if (response.status === 429) {
      const wait = Number(response.headers.get("Retry-After") ?? "20");
      await sleep((Number.isFinite(wait) ? wait : 20) * 1000);
      continue;
    }
    if (response.status === 404) {
      throw new NotFound();
    }
    if (response.status === 401 || response.status === 403) {
      throw new Error(
        `Planning Center refused the token (HTTP ${response.status}) for ${new URL(url).pathname.split("/").slice(0, 3).join("/")}. Check PCO_PAT_ID and PCO_PAT_SECRET, and that the token includes Services and People.`,
      );
    }
    if (!response.ok) {
      throw new Error(`Planning Center answered HTTP ${response.status}`);
    }
    return (await response.json()) as never;
  }
  throw new Error("Planning Center kept asking us to slow down");
}

/** Every item of a list, following "next" pages back to Planning Center only. */
async function list(
  path: string,
  authorization: string,
  maxPages = 20,
): Promise<{ data: Resource[]; included: Resource[] }> {
  const data: Resource[] = [];
  const included: Resource[] = [];
  let url: string | null = new URL(path, API).toString();
  for (let page = 0; url && page < maxPages; page += 1) {
    const body = await get(url, authorization);
    data.push(...(Array.isArray(body.data) ? body.data : [body.data]));
    included.push(...(body.included ?? []));
    const next: string | null = body.links?.next ?? null;
    url = next?.startsWith(`${API}/`) ? next : null;
  }
  return { data, included };
}

async function orEmpty<T>(load: () => Promise<T[]>): Promise<T[]> {
  try {
    return await load();
  } catch (error) {
    if (error instanceof NotFound) {
      return [];
    }
    throw error;
  }
}

/** The first of several possible paths that Planning Center answers. */
async function firstFound(
  paths: string[],
  authorization: string,
): Promise<{ data: Resource[]; included: Resource[] } | null> {
  for (const path of paths) {
    try {
      return await list(path, authorization);
    } catch (error) {
      if (!(error instanceof NotFound)) {
        throw error;
      }
    }
  }
  return null;
}

async function read(authorization: string): Promise<PcoPayload> {
  const now = Date.now();
  const from = new Date(now - 86_400_000);
  const to = new Date(now + DAYS_AHEAD * 86_400_000);
  const payload: PcoPayload = {
    from: from.toISOString(),
    to: to.toISOString(),
    service_types: [],
    teams: [],
    people: [],
    roster: [],
    plans: [],
    blockouts: [],
  };

  const serviceTypes = (
    await list("/services/v2/service_types?per_page=100&order=sequence", authorization)
  ).data.filter(isLive);
  payload.service_types = serviceTypes.map((st) => ({
    id: st.id,
    name: String(st.attributes.name ?? ""),
  }));

  let rosterSource = "none";
  const rosterRead = new Set<string>();
  for (const st of serviceTypes) {
    const teams = await orEmpty(async () => {
      const { data, included } = await list(
        `/services/v2/service_types/${st.id}/teams?per_page=100&include=team_positions`,
        authorization,
      );
      return mapTeams(st.id, data, included);
    });
    // A team can belong to several service types (one media team for Sunday, Communion, and
    // Crossover): it's listed once, under the first, and its roster is read once.
    payload.teams.push(...teams.filter((t) => !payload.teams.some((seen) => seen.id === t.id)));
    const positions = teams.flatMap((t) => t.positions.map((p) => ({ id: p.id, team_id: t.id })));

    // Who is on each position's team (the roster), whether scheduled or not.
    for (const team of teams) {
      if (rosterRead.has(team.id)) {
        continue;
      }
      rosterRead.add(team.id);
      const byTeam = await firstFound(
        [`/services/v2/teams/${team.id}/person_team_position_assignments?per_page=100`],
        authorization,
      );
      if (byTeam) {
        rosterSource = "team";
        payload.roster.push(...mapRoster(byTeam.data, positions));
        continue;
      }
      for (const position of team.positions) {
        const byPosition = await firstFound(
          [
            `/services/v2/service_types/${st.id}/team_positions/${position.id}/person_team_position_assignments?per_page=100`,
          ],
          authorization,
        );
        if (byPosition) {
          rosterSource = "position";
          payload.roster.push(
            ...byPosition.data.flatMap((a) => {
              const person = relatedId(a, "person");
              return person
                ? [{ person_id: person, team_id: team.id, position_id: position.id }]
                : [];
            }),
          );
        }
      }
    }

    // Plans from yesterday to the end of the window, with who's scheduled.
    const after = from.toISOString().slice(0, 10);
    const plans = await orEmpty(
      async () =>
        (
          await list(
            `/services/v2/service_types/${st.id}/plans?filter=after&after=${after}&order=sort_date&per_page=50`,
            authorization,
            2,
          )
        ).data,
    );
    for (const plan of plans) {
      const sortDate = Date.parse(String(plan.attributes.sort_date ?? ""));
      if (!Number.isFinite(sortDate) || sortDate >= to.getTime()) {
        continue;
      }
      const [times, members] = await Promise.all([
        orEmpty(
          async () =>
            (
              await list(
                `/services/v2/service_types/${st.id}/plans/${plan.id}/plan_times`,
                authorization,
              )
            ).data,
        ),
        orEmpty(
          async () =>
            (
              await list(
                `/services/v2/service_types/${st.id}/plans/${plan.id}/team_members?per_page=100`,
                authorization,
              )
            ).data,
        ),
      ]);
      const window = planWindow(plan, times);
      if (!window) {
        continue;
      }
      payload.plans.push({
        id: plan.id,
        title: planTitle(String(st.attributes.name ?? "Service"), plan),
        ...window,
        members: mapMembers(members, teams),
      });
    }
  }

  // Everyone on a roster or a plan: their name and emails (for matching), and their blockouts.
  const people = new Set([
    ...payload.roster.map((r) => r.person_id),
    ...payload.plans.flatMap((p) => p.members.map((m) => m.person_id)),
  ]);
  for (const id of people) {
    const person = await orEmpty(async () => {
      const { data, included } = await list(
        `/people/v2/people/${id}?include=emails`,
        authorization,
        1,
      );
      return data.map((p) => mapPerson(p, included));
    });
    payload.people.push(...person);
    const blockouts = await orEmpty(
      async () =>
        (
          await list(
            `/services/v2/people/${id}/blockouts?filter=future&per_page=100`,
            authorization,
            2,
          )
        ).data,
    );
    payload.blockouts.push(
      ...blockouts.flatMap((b) => {
        const mapped = mapBlockout(id, b);
        return mapped ? [mapped] : [];
      }),
    );
  }

  console.log(
    `Planning Center read: roster from ${rosterSource} assignments, ${requests} requests.`,
  );
  return payload;
}

async function main(): Promise<void> {
  const supabaseUrl = env("SUPABASE_URL").replace(/\/+$/, "");
  const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
  const appId = env("PCO_PAT_ID");
  const secret = env("PCO_PAT_SECRET");
  if (!supabaseUrl || !serviceKey) {
    console.log("Planning Center sync: Supabase isn't configured; nothing to do.");
    return;
  }
  if (!appId || !secret) {
    console.log("Planning Center sync: PCO_PAT_ID and PCO_PAT_SECRET aren't set; nothing synced.");
    return;
  }
  const authorization = `Basic ${Buffer.from(`${appId}:${secret}`).toString("base64")}`;
  const started = Date.now();
  const payload = await read(authorization);

  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/sync_planning_center`, {
    method: "POST",
    headers: { ...supabaseKeyHeaders(serviceKey), "Content-Type": "application/json" },
    body: JSON.stringify({ p: payload }),
  });
  if (!response.ok) {
    // Postgres's error code and message, with anything quoted blanked out, so no value from the
    // data can reach the log. PostgREST's details and hint can hold values, so they're dropped.
    const body = (await response.json().catch(() => ({}))) as { code?: unknown; message?: unknown };
    const code =
      typeof body.code === "string" ? body.code.replace(/[^A-Z0-9]/gi, "").slice(0, 8) : "";
    const message =
      typeof body.message === "string"
        ? body.message.replace(/"[^"]*"|'[^']*'|\([^)]*\)/g, "…").slice(0, 200)
        : "";
    throw new Error(
      `sync_planning_center failed with HTTP ${response.status}${code ? ` (${code}: ${message})` : ""}`,
    );
  }
  // Counts only: no names, emails, or ids.
  const counts = (await response.json()) as Record<string, number>;
  console.log(
    `Planning Center sync done in ${Math.round((Date.now() - started) / 1000)} s: ${Object.entries(
      counts,
    )
      .map(([key, value]) => `${key.replaceAll("_", " ")} ${Number(value)}`)
      .join(", ")}.`,
  );
}

main().catch((error: unknown) => {
  console.error(`Planning Center sync failed: ${(error as Error).message}`);
  process.exitCode = 1;
});
