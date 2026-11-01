import { describe, expect, it } from "vitest";
import {
  addableFor,
  addableLabel,
  allTeamMembers,
  positionTeam,
  toTeamError,
  trainingLabel,
  type TeamPerson,
} from "./teams";

const person = (name: string, overrides: Partial<TeamPerson> = {}): TeamPerson => ({
  id: name,
  name,
  isMember: false,
  teamRoleIds: [],
  trainedRoleIds: [],
  ...overrides,
});

const wide = { id: "wide", name: "Camera 1" };
const live = { id: "live", name: "Camera 2" };

describe("position teams", () => {
  const people = [
    person("Drew"),
    person("Casey", { isMember: true }),
    person("Blake", { isMember: true, trainedRoleIds: ["wide"] }),
    person("Eden", { isMember: true, teamRoleIds: ["live"] }),
    person("Avery", { isMember: true, teamRoleIds: ["wide", "live"], trainedRoleIds: ["wide"] }),
  ];

  it("lists one position's team by name", () => {
    expect(positionTeam(people, "wide").map((p) => p.name)).toEqual(["Avery"]);
    expect(positionTeam(people, "live").map((p) => p.name)).toEqual(["Avery", "Eden"]);
  });

  it("offers trained people first, then teammates, then learners, then everyone else", () => {
    expect(addableFor(people, "wide").map((p) => p.name)).toEqual([
      "Blake",
      "Eden",
      "Casey",
      "Drew",
    ]);
  });

  it("shows training without deciding it", () => {
    expect(trainingLabel(people[4]!, "wide")).toBe("Trained");
    expect(trainingLabel(people[4]!, "live")).toBe("Still learning");
    expect(addableLabel(people[0]!, "wide")).toBe("Drew (not in this department yet)");
    expect(addableLabel(people[2]!, "wide")).toBe("Blake (trained)");
    expect(addableLabel(people[1]!, "wide")).toBe("Casey (still learning)");
  });

  it("lists everyone on a position with their positions in order", () => {
    expect(
      allTeamMembers(people, [wide, live]).map(({ person: p, positions }) => [
        p.name,
        positions.map((x) => x.name),
      ]),
    ).toEqual([
      ["Avery", ["Camera 1", "Camera 2"]],
      ["Eden", ["Camera 2"]],
    ]);
  });

  it("maps database errors", () => {
    expect(toTeamError({ message: "person_not_active" })).toBe("person_not_active");
    expect(toTeamError({ message: "role_archived" })).toBe("role_archived");
    expect(toTeamError({ code: "42501", message: "not_authorized" })).toBe("not_authorized");
    expect(toTeamError({ code: "XX000", message: "secret" })).toBe("unknown");
  });
});
