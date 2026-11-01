import { describe, expect, it } from "vitest";
import {
  mapBlockout,
  mapMembers,
  mapPerson,
  mapRoster,
  mapTeams,
  planTitle,
  planWindow,
  relatedId,
  type Resource,
} from "./planning-center";

const res = (
  type: string,
  id: string,
  attributes: Record<string, unknown> = {},
  relationships: Resource["relationships"] = {},
): Resource => ({ type, id, attributes, relationships });
const one = (type: string, id: string) => ({ data: { type, id } });

describe("Planning Center mapping", () => {
  const teams = mapTeams(
    "st1",
    [
      res(
        "Team",
        "t1",
        { name: "479 Media Team" },
        {
          team_positions: {
            data: [
              { type: "TeamPosition", id: "p1" },
              { type: "TeamPosition", id: "p2" },
            ],
          },
        },
      ),
      res("Team", "t2", { name: "Old team", archived_at: "2026-01-01T00:00:00Z" }),
    ],
    [res("TeamPosition", "p1", { name: "Camera 1" }), res("TeamPosition", "p2", { name: "Audio" })],
  );

  it("reads live teams with their positions", () => {
    expect(teams).toEqual([
      {
        id: "t1",
        service_type_id: "st1",
        name: "479 Media Team",
        positions: [
          { id: "p1", name: "Camera 1" },
          { id: "p2", name: "Audio" },
        ],
      },
    ]);
  });

  it("matches a scheduled person's position by name, as the checklist app does", () => {
    const members = mapMembers(
      [
        res(
          "PlanPerson",
          "m1",
          { status: "C", team_position_name: "  camera  1 " },
          {
            person: one("Person", "u1"),
            team: one("Team", "t1"),
          },
        ),
        res(
          "PlanPerson",
          "m2",
          { status: "D", team_position_name: "Renamed" },
          {
            person: one("Person", "u2"),
            team: one("Team", "t1"),
          },
        ),
        res("PlanPerson", "m3", { status: "U" }, { team: one("Team", "t1") }),
      ],
      teams,
    );
    expect(members).toEqual([
      { id: "m1", person_id: "u1", team_id: "t1", position_id: "p1", status: "C" },
      { id: "m2", person_id: "u2", team_id: "t1", position_id: null, status: "D" },
    ]);
  });

  it("times a plan from its service times, else its date", () => {
    const plan = res("Plan", "pl1", { sort_date: "2026-11-08T16:05:00Z" });
    expect(
      planWindow(plan, [
        res("PlanTime", "a", {
          time_type: "rehearsal",
          starts_at: "2026-11-08T14:00:00Z",
          ends_at: "2026-11-08T15:00:00Z",
        }),
        res("PlanTime", "b", {
          time_type: "service",
          starts_at: "2026-11-08T16:05:00Z",
          ends_at: "2026-11-08T17:50:00Z",
        }),
      ]),
    ).toEqual({ starts_at: "2026-11-08T16:05:00.000Z", ends_at: "2026-11-08T17:50:00.000Z" });
    expect(planWindow(plan, [])).toEqual({
      starts_at: "2026-11-08T16:05:00.000Z",
      ends_at: "2026-11-08T18:05:00.000Z",
    });
    expect(planWindow(res("Plan", "x"), [])).toBeNull();
  });

  it("titles a plan with its service type", () => {
    expect(planTitle("Communion Service", res("Plan", "p", { title: "" }))).toBe(
      "Communion Service",
    );
    expect(planTitle("479 Sunday Service", res("Plan", "p", { title: "Advent" }))).toBe(
      "479 Sunday Service: Advent",
    );
  });

  it("reads a person's name and emails, lower-cased", () => {
    expect(
      mapPerson(res("Person", "u1", { name: "Fake Person" }), [
        res(
          "Email",
          "e1",
          { address: " Fake.Person@Example.com " },
          { person: one("Person", "u1") },
        ),
        res("Email", "e2", { address: "not-an-email" }),
        res("Email", "e3", { address: "someone@example.com" }, { person: one("Person", "u9") }),
      ]),
    ).toEqual({ id: "u1", name: "Fake Person", emails: ["fake.person@example.com"] });
  });

  it("turns blockouts into whole Winnipeg days", () => {
    // Midnight to midnight Winnipeg time (CDT, UTC-5) is one day, not two.
    expect(
      mapBlockout(
        "u1",
        res("Blockout", "b1", {
          starts_at: "2026-07-05T05:00:00Z",
          ends_at: "2026-07-06T05:00:00Z",
          reason: "Away",
        }),
      ),
    ).toEqual({
      id: "b1",
      person_id: "u1",
      starts_on: "2026-07-05",
      ends_on: "2026-07-05",
      reason: "Away",
    });
  });

  it("reads the roster from position assignments", () => {
    expect(
      mapRoster(
        [
          res(
            "PersonTeamPositionAssignment",
            "a1",
            {},
            {
              person: one("Person", "u1"),
              team_position: one("TeamPosition", "p2"),
            },
          ),
          res("PersonTeamPositionAssignment", "a2", {}, { person: one("Person", "u2") }),
        ],
        [{ id: "p2", team_id: "t1" }],
      ),
    ).toEqual([{ person_id: "u1", team_id: "t1", position_id: "p2" }]);
    expect(relatedId(res("X", "1"), "missing")).toBeNull();
  });
});
