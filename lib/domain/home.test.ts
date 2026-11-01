import { describe, expect, it } from "vitest";
import {
  countedLessons,
  courseCountLabel,
  homeState,
  levelProgressLabel,
  summariseLearning,
} from "./home";

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
    expect(audio?.levels[0]).toMatchObject({ lessonsTotal: 0, lessonsDone: 0 });
  });

  it("adds up the lessons the learner marked complete per level", () => {
    const [camera] = summariseLearning(["cam"], levels, [
      {
        levelId: "l1",
        lessons: [
          { key: "a", isRequired: false },
          { key: "b", isRequired: false },
        ],
        completedKeys: new Set(["a"]),
      },
      { levelId: "l1", lessons: [{ key: "c", isRequired: false }], completedKeys: new Set(["c"]) },
    ]);
    expect(camera?.levels[0]).toMatchObject({ lessonsTotal: 3, lessonsDone: 2 });
  });
});

describe("countedLessons", () => {
  it("counts only required lessons when a course has any", () => {
    expect(
      countedLessons(
        [
          { key: "a", isRequired: true },
          { key: "b", isRequired: false },
        ],
        new Set(["b"]),
      ),
    ).toEqual({ total: 1, done: 0 });
  });

  it("counts every lesson when none are required", () => {
    expect(
      countedLessons(
        [
          { key: "a", isRequired: false },
          { key: "b", isRequired: false },
        ],
        new Set(["b", "zz"]),
      ),
    ).toEqual({ total: 2, done: 1 });
  });
});

describe("levelProgressLabel", () => {
  const base = { levelId: "l", number: 1, name: "Foundations" };
  it("is honest about empty levels", () => {
    expect(
      levelProgressLabel({ ...base, publishedCourses: 0, lessonsTotal: 0, lessonsDone: 0 }),
    ).toBe("No courses yet");
  });

  it("shows lessons done of the total", () => {
    expect(
      levelProgressLabel({ ...base, publishedCourses: 2, lessonsTotal: 12, lessonsDone: 4 }),
    ).toBe("4 of 12 lessons");
    expect(
      levelProgressLabel({ ...base, publishedCourses: 1, lessonsTotal: 1, lessonsDone: 0 }),
    ).toBe("0 of 1 lesson");
  });

  it("falls back to the course count when lessons aren't readable", () => {
    expect(
      levelProgressLabel({ ...base, publishedCourses: 2, lessonsTotal: 0, lessonsDone: 0 }),
    ).toBe("2 courses");
  });
});

describe("courseCountLabel", () => {
  it("uses singular and plural", () => {
    expect(courseCountLabel(1)).toBe("1 course");
    expect(courseCountLabel(0)).toBe("0 courses");
    expect(courseCountLabel(4)).toBe("4 courses");
  });
});
