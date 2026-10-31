import { describe, expect, it } from "vitest";
import { courseCountLabel, homeState, summariseLearning } from "./home";

describe("homeState", () => {
  it("is new when someone has no memberships or requests", () => {
    expect(homeState([{ state: { kind: "can_request", previously: null } }])).toBe("new");
    expect(homeState([])).toBe("new");
  });

  it("is pending while a request waits and nothing is approved", () => {
    expect(
      homeState([
        { state: { kind: "requested" } },
        { state: { kind: "can_request", previously: "declined" } },
      ]),
    ).toBe("pending");
  });

  it("is member once any department membership is active, even with other requests waiting", () => {
    expect(homeState([{ state: { kind: "requested" } }, { state: { kind: "member" } }])).toBe(
      "member",
    );
  });

  it("does not treat coming-soon or invite-only departments as membership", () => {
    expect(
      homeState([{ state: { kind: "coming_soon" } }, { state: { kind: "invite_only" } }]),
    ).toBe("new");
  });
});

describe("summariseLearning", () => {
  const levels = [
    { id: "l3", departmentId: "cam", number: 3, name: "Advanced and Leadership" },
    { id: "l1", departmentId: "cam", number: 1, name: "Foundations" },
    { id: "l2", departmentId: "cam", number: 2, name: "Proficiency" },
    { id: "a1", departmentId: "aud", number: 1, name: "Foundations" },
  ];

  it("counts published courses per level, in level order", () => {
    const [camera] = summariseLearning(["cam"], levels, [
      { levelId: "l1" },
      { levelId: "l1" },
      { levelId: "l3" },
    ]);
    expect(camera?.levels.map((level) => [level.number, level.publishedCourses])).toEqual([
      [1, 2],
      [2, 0],
      [3, 1],
    ]);
    expect(camera?.publishedCourses).toBe(3);
  });

  it("reports zero rather than inventing content", () => {
    const [audio] = summariseLearning(["aud"], levels, []);
    expect(audio?.publishedCourses).toBe(0);
    expect(audio?.levels).toHaveLength(1);
  });
});

describe("courseCountLabel", () => {
  it("uses singular and plural", () => {
    expect(courseCountLabel(1)).toBe("1 course");
    expect(courseCountLabel(0)).toBe("0 courses");
    expect(courseCountLabel(4)).toBe("4 courses");
  });
});
