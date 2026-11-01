// Position links on the Planning Center page (checklist app US-15). Planning Center gives each
// service type its own copy of a team, so "479 Media Team" in three service types is three teams
// with one name. The page shows each name once, and a link applies to every copy (G, 2026-11-01).

export type PcoTarget = { teamId: string; positionId: string | null };

type ServiceTypeInput = {
  name: string;
  teams: {
    id: string;
    name: string;
    roleId: string | null;
    positions: { id: string; name: string; roleId: string | null }[];
  }[];
};

export type LinkRowGroup = {
  label: string;
  targets: PcoTarget[];
  /** The Academy position, when every copy is linked the same way. */
  roleId: string | null;
  /** Copies are linked to different positions. */
  mixed: boolean;
};

export type TeamGroup = {
  name: string;
  serviceTypes: string[];
  wholeTeam: LinkRowGroup;
  positions: LinkRowGroup[];
  /** Any copy or position has a link: shown first. */
  linked: boolean;
};

const key = (name: string) => name.replace(/\s+/g, " ").trim().toLowerCase();

function row(label: string, entries: Entry[]): LinkRowGroup {
  const roles = new Set(entries.map((entry) => entry.roleId));
  return {
    label,
    targets: entries.map((entry) => entry.target),
    roleId: roles.size === 1 ? (entries[0]?.roleId ?? null) : null,
    mixed: roles.size > 1,
  };
}

type Entry = { target: PcoTarget; roleId: string | null };
type NameGroup = {
  name: string;
  serviceTypes: string[];
  whole: Entry[];
  positions: Map<string, { label: string; entries: Entry[] }>;
};

/** Teams with the same name across service types, as one group; linked ones first. */
export function groupTeamsByName(serviceTypes: readonly ServiceTypeInput[]): TeamGroup[] {
  const byName = new Map<string, NameGroup>();
  for (const type of serviceTypes) {
    for (const team of type.teams) {
      const group: NameGroup = byName.get(key(team.name)) ?? {
        name: team.name,
        serviceTypes: [],
        whole: [],
        positions: new Map(),
      };
      byName.set(key(team.name), group);
      if (!group.serviceTypes.includes(type.name)) {
        group.serviceTypes.push(type.name);
      }
      group.whole.push({ target: { teamId: team.id, positionId: null }, roleId: team.roleId });
      for (const position of team.positions) {
        const entry = group.positions.get(key(position.name)) ?? {
          label: position.name,
          entries: [],
        };
        group.positions.set(key(position.name), entry);
        entry.entries.push({
          target: { teamId: team.id, positionId: position.id },
          roleId: position.roleId,
        });
      }
    }
  }
  const groups = [...byName.values()].map((group): TeamGroup => {
    const positions = [...group.positions.values()].map((p) => row(p.label, p.entries));
    const wholeTeam = row(group.name, group.whole);
    return {
      name: group.name,
      serviceTypes: group.serviceTypes,
      wholeTeam,
      positions,
      linked: [wholeTeam, ...positions].some((r) => r.roleId !== null || r.mixed),
    };
  });
  return groups.sort((a, b) => Number(b.linked) - Number(a.linked) || a.name.localeCompare(b.name));
}
