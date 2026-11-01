import { describe, expect, it } from "vitest";
import { groupTeamsByName } from "./pco-links";

const team = (
  id: string,
  name: string,
  roleId: string | null,
  positions: [string, string, string | null][],
) => ({
  id,
  name,
  roleId,
  positions: positions.map(([pid, pname, role]) => ({ id: pid, name: pname, roleId: role })),
});

describe("groupTeamsByName", () => {
  const groups = groupTeamsByName([
    {
      name: "Fake Sunday",
      teams: [
        team("t1", "Fake Media Team", null, [
          ["p1", "Camera 1", "cam"],
          ["p2", "Audio", "aud"],
        ]),
      ],
    },
    {
      name: "Fake Special",
      teams: [
        team("t2", " fake media  team", null, [
          ["p3", "Camera 1", "cam"],
          ["p4", "Audio", null],
        ]),
        team("t3", "Fake Video", null, [["p5", "Camera 1", null]]),
      ],
    },
  ]);

  it("shows a team once across service types, linked teams first", () => {
    expect(groups.map((g) => [g.name, g.serviceTypes])).toEqual([
      ["Fake Media Team", ["Fake Sunday", "Fake Special"]],
      ["Fake Video", ["Fake Special"]],
    ]);
    expect(groups[1]?.linked).toBe(false);
  });

  it("links every copy of a position together, and flags copies linked differently", () => {
    const [camera, audio] = groups[0]?.positions ?? [];
    expect(camera).toEqual({
      label: "Camera 1",
      targets: [
        { teamId: "t1", positionId: "p1" },
        { teamId: "t2", positionId: "p3" },
      ],
      roleId: "cam",
      mixed: false,
    });
    expect(audio?.mixed).toBe(true);
    expect(audio?.roleId).toBeNull();
    expect(groups[0]?.wholeTeam.targets).toEqual([
      { teamId: "t1", positionId: null },
      { teamId: "t2", positionId: null },
    ]);
  });
});
