/**
 * Position teams (decided 2026-10-31, decision record 9), as in Planning Center Services: people
 * are added to each position (serving role), and a position can only be filled from its team.
 * Joining a department is for learning; whoever runs the teams (team.manage) adds people to a
 * position when they're ready. Training shows beside each name but never decides it. The database
 * is the authority: add_to_serving_team and remove_from_serving_team.
 */

export type TeamPerson = {
  id: string;
  name: string;
  isMember: boolean;
  teamRoleIds: string[];
  trainedRoleIds: string[];
};

export type Position = { id: string; name: string };

/** The people on one position's team, by name. */
export function positionTeam(people: readonly TeamPerson[], roleId: string): TeamPerson[] {
  return people
    .filter((p) => p.teamRoleIds.includes(roleId))
    .toSorted((a, b) => a.name.localeCompare(b.name));
}

/**
 * Who could be added to a position: trained for it first, then on another position in the
 * department, then learning in the department, then everyone else, each by name.
 */
export function addableFor(people: readonly TeamPerson[], roleId: string): TeamPerson[] {
  const rank = (p: TeamPerson) =>
    p.trainedRoleIds.includes(roleId) ? 0 : p.teamRoleIds.length > 0 ? 1 : p.isMember ? 2 : 3;
  return people
    .filter((p) => !p.teamRoleIds.includes(roleId))
    .toSorted((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

/** "Trained" or "Still learning" for this position. */
export function trainingLabel(person: TeamPerson, roleId: string): string {
  return person.trainedRoleIds.includes(roleId) ? "Trained" : "Still learning";
}

/** How someone shows in a position's "Add" list. */
export function addableLabel(person: TeamPerson, roleId: string): string {
  const note = person.trainedRoleIds.includes(roleId)
    ? "trained"
    : person.isMember
      ? "still learning"
      : "not in this department yet";
  return `${person.name} (${note})`;
}

/** Everyone on at least one position, with their positions in the department's order. */
export function allTeamMembers(
  people: readonly TeamPerson[],
  positions: readonly Position[],
): { person: TeamPerson; positions: Position[] }[] {
  return people
    .filter((p) => p.teamRoleIds.length > 0)
    .toSorted((a, b) => a.name.localeCompare(b.name))
    .map((person) => ({
      person,
      positions: positions.filter((position) => person.teamRoleIds.includes(position.id)),
    }));
}

export type TeamError = "not_authorized" | "person_not_active" | "role_archived" | "unknown";

export function toTeamError(
  error: { code?: string | null; message?: string | null } | null | undefined,
): TeamError {
  if (error?.message === "person_not_active" || error?.message === "role_archived") {
    return error.message;
  }
  return error?.code === "42501" ? "not_authorized" : "unknown";
}

export function teamErrorMessage(error: TeamError): string {
  switch (error) {
    case "not_authorized":
      return "Only people who run this department's teams can do that.";
    case "person_not_active":
      return "Their account isn't active. Check People and roles.";
    case "role_archived":
      return "This position has been archived.";
    case "unknown":
      return "That didn't save. Check your connection and try again.";
  }
}
