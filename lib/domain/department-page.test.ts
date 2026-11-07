import { describe, expect, it } from "vitest";
import { lessonTally, openingLevel, roleSteps } from "./department-page";
import type { CourseProgress } from "./progress";

const progress = (done: number, total: number): CourseProgress => ({
  state: done === 0 ? "not_started" : done === total ? "completed" : "in_progress",
  countedTotal: total,
  countedCompleted: done,
  quizzesTotal: 0,
  quizzesPassed: 0,
  practicalsTotal: 0,
  practicalsPassed: 0,
  percent: total ? Math.round((done / total) * 100) : 0,
  next: null,
});

describe("lessonTally", () => {
  it("adds up counted lessons, and falls back to the lesson count without progress", () => {
    const tally = lessonTally(
      [
        { id: "a", lessonCount: 17 },
        { id: "b", lessonCount: 7 },
        { id: "c", lessonCount: 3 },
      ],
      new Map([["a", progress(6, 17)]]),
    );
    expect(tally).toEqual({ done: 6, total: 27, percent: 22 });
  });

  it("is zero, not a division error, with nothing to count", () => {
    expect(lessonTally([], new Map())).toEqual({ done: 0, total: 0, percent: 0 });
  });
});

describe("openingLevel", () => {
  const levels = [
    { courses: [] },
    { courses: [{ id: "a", lessonCount: 1 }] },
    { courses: [{ id: "b", lessonCount: 1 }] },
  ];

  it("opens the level holding the course to carry on with", () => {
    expect(openingLevel(levels, "b")).toBe(2);
  });

  it("otherwise opens the first level with courses, or none", () => {
    expect(openingLevel(levels, null)).toBe(1);
    expect(openingLevel([{ courses: [] }], null)).toBe(-1);
  });
});

describe("roleSteps", () => {
  const role = {
    required: [
      { id: "s1", name: "Tripod camera" },
      { id: "s2", name: "Live framing" },
    ],
    readiness: { missing: ["Live framing"], unconfigured: false },
  };

  it("lists membership, then each skill, passed or still needed", () => {
    expect(roleSteps(role, "Camera Operations", true)).toEqual([
      { label: "Member of Camera Operations", done: true },
      { label: "Tripod camera passed", done: true },
      { label: "Needs Live framing", done: false },
    ]);
  });

  it("says when a role has no hands-on check yet", () => {
    expect(
      roleSteps({ required: [], readiness: { missing: [], unconfigured: true } }, "Audio", false),
    ).toEqual([
      { label: "Join Audio", done: false },
      { label: "Hands-on check: not set up yet", done: false },
    ]);
  });
});
