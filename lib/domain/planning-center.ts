/**
 * Planning Center Services, read for the Academy (decision record 9, revised 2026-10-31). Pure
 * mapping from Planning Center's JSON:API resources to the payload sync_planning_center() applies.
 * No imports, so the scheduled job (scripts/sync-planning-center.ts) can run this file directly.
 * Follows the same rules as IFC's Sunday Pre-Service Checklist app, which reads the same account.
 */

/** One JSON:API resource, as Planning Center returns it. */
export type Resource = {
  type: string;
  id: string;
  attributes: Record<string, unknown>;
  relationships?: Record<
    string,
    { data: { type: string; id: string } | { type: string; id: string }[] | null }
  >;
};

export type PcoTeam = {
  id: string;
  service_type_id: string;
  name: string;
  positions: { id: string; name: string }[];
};

export type PcoMember = {
  id: string;
  person_id: string;
  team_id: string;
  position_id: string | null;
  status: string;
};

export type PcoPlan = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  members: PcoMember[];
};

export type PcoPayload = {
  from: string;
  to: string;
  service_types: { id: string; name: string }[];
  teams: PcoTeam[];
  people: { id: string; name: string; emails: string[] }[];
  roster: { person_id: string; team_id: string; position_id: string | null }[];
  plans: PcoPlan[];
  blockouts: {
    id: string;
    person_id: string;
    starts_on: string;
    ends_on: string;
    reason: string;
  }[];
};

/** The id of a to-one relationship, or null. */
export function relatedId(resource: Resource, name: string): string | null {
  const data = resource.relationships?.[name]?.data;
  return data && !Array.isArray(data) ? data.id : null;
}

/** Not archived or deleted in Planning Center. */
export function isLive(resource: Resource): boolean {
  return !resource.attributes.archived_at && !resource.attributes.deleted_at;
}

const text = (value: unknown) => (typeof value === "string" ? value : "");
const sameName = (a: string, b: string) =>
  a.replace(/\s+/g, " ").trim().toLowerCase() === b.replace(/\s+/g, " ").trim().toLowerCase();

/** A service type's teams, each with its positions. */
export function mapTeams(serviceTypeId: string, data: Resource[], included: Resource[]): PcoTeam[] {
  const positions = included.filter((r) => r.type === "TeamPosition");
  return data.filter(isLive).map((team) => {
    const refs = team.relationships?.team_positions?.data;
    const own = Array.isArray(refs)
      ? refs.flatMap((ref) => positions.filter((p) => p.id === ref.id))
      : positions.filter((p) => relatedId(p, "team") === team.id);
    return {
      id: team.id,
      service_type_id: serviceTypeId,
      name: text(team.attributes.name),
      positions: own.map((p) => ({ id: p.id, name: text(p.attributes.name) })),
    };
  });
}

/**
 * Who is scheduled in a plan, with their reply (C confirmed, U unconfirmed, D declined).
 * Planning Center names the position here instead of giving its id, so it's matched by name
 * within the team, as the checklist app does. A name that matches nothing leaves position_id
 * null, and the team's own link (if any) applies.
 */
export function mapMembers(members: Resource[], teams: readonly PcoTeam[]): PcoMember[] {
  return members.flatMap((member) => {
    const personId = relatedId(member, "person");
    const teamId = relatedId(member, "team");
    if (!personId || !teamId) {
      return [];
    }
    const positionName = text(member.attributes.team_position_name);
    const position = positionName
      ? teams.find((t) => t.id === teamId)?.positions.find((p) => sameName(p.name, positionName))
      : undefined;
    return [
      {
        id: member.id,
        person_id: personId,
        team_id: teamId,
        position_id: position?.id ?? null,
        status: text(member.attributes.status) || "U",
      },
    ];
  });
}

const HOUR = 3_600_000;

/**
 * When a plan runs: from its first service time to its last, else its sort date for two hours.
 * Always ends after it starts and within a day, as the Academy's events require.
 */
export function planWindow(
  plan: Resource,
  planTimes: Resource[],
): { starts_at: string; ends_at: string } | null {
  const services = planTimes
    .filter((t) => text(t.attributes.time_type) === "service")
    .map((t) => ({
      starts: Date.parse(text(t.attributes.starts_at)),
      ends: Date.parse(text(t.attributes.ends_at)),
    }))
    .filter((t) => Number.isFinite(t.starts));
  let starts: number;
  let ends: number;
  if (services.length > 0) {
    starts = Math.min(...services.map((t) => t.starts));
    ends = Math.max(
      ...services.map((t) => (Number.isFinite(t.ends) ? t.ends : t.starts + 2 * HOUR)),
    );
  } else {
    starts = Date.parse(text(plan.attributes.sort_date));
    if (!Number.isFinite(starts)) {
      return null;
    }
    ends = starts + 2 * HOUR;
  }
  if (!(ends > starts)) {
    ends = starts + 2 * HOUR;
  }
  ends = Math.min(ends, starts + 24 * HOUR);
  return { starts_at: new Date(starts).toISOString(), ends_at: new Date(ends).toISOString() };
}

/** "479 Sunday Service" or "Communion Service: Advent" when the plan has its own title. */
export function planTitle(serviceTypeName: string, plan: Resource): string {
  const title = text(plan.attributes.title).trim();
  return (title ? `${serviceTypeName}: ${title}` : serviceTypeName).slice(0, 120);
}

/** A person's name and email addresses, from People with its emails included. */
export function mapPerson(
  person: Resource,
  included: Resource[],
): { id: string; name: string; emails: string[] } {
  const name =
    text(person.attributes.name) ||
    [text(person.attributes.first_name), text(person.attributes.last_name)].join(" ").trim();
  const emails = included
    .filter((r) => r.type === "Email" && (relatedId(r, "person") ?? person.id) === person.id)
    .map((r) => text(r.attributes.address).trim().toLowerCase())
    .filter((address) => address.includes("@"));
  return { id: person.id, name, emails: [...new Set(emails)] };
}

/** The Winnipeg calendar date of an instant. */
export function winnipegDate(instant: number): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Winnipeg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(instant));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** A blockout as whole Winnipeg days. An end at midnight belongs to the day before. */
export function mapBlockout(
  personId: string,
  blockout: Resource,
): PcoPayload["blockouts"][number] | null {
  const starts = Date.parse(text(blockout.attributes.starts_at));
  const ends = Date.parse(text(blockout.attributes.ends_at));
  if (!Number.isFinite(starts)) {
    return null;
  }
  const last = Number.isFinite(ends) && ends > starts ? ends - 1000 : starts;
  return {
    id: blockout.id,
    person_id: personId,
    starts_on: winnipegDate(starts),
    ends_on: winnipegDate(last),
    reason: text(blockout.attributes.reason).slice(0, 200),
  };
}

/** Roster entries from person-team-position assignments, with the position's team. */
export function mapRoster(
  assignments: Resource[],
  positions: readonly { id: string; team_id: string }[],
): PcoPayload["roster"] {
  return assignments.flatMap((assignment) => {
    const personId = relatedId(assignment, "person");
    const positionId = relatedId(assignment, "team_position");
    const position = positions.find((p) => p.id === positionId);
    return personId && position
      ? [{ person_id: personId, team_id: position.team_id, position_id: position.id }]
      : [];
  });
}
