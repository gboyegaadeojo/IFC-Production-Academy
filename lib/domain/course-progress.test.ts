import { describe, expect, it } from "vitest";
import {
  assignableMatches,
  lessonPercent,
  lessonsDone,
  nextLessonKey,
  progressStatus,
  statusCounts,
  type PersonProgress,
} from "./course-progress";

const person = (
  status: PersonProgress["status"],
  completedLessons: string[] = [],
): PersonProgress => ({
  userId: "u",
  name: "Avery Example",
  status,
  completedLessons,
  quizzes: [],
  passedPracticals: [],
  assignedAt: null,
});
const view = {
  lessons: [
    { key: "a", title: "A" },
    { key: "b", title: "B" },
  ],
};

describe("progressStatus", () => {
  it("treats waiting for an assessment as still in progress", () => {
    expect(progressStatus("awaiting_assessment")).toBe("in_progress");
    expect(progressStatus("completed")).toBe("finished");
    expect(progressStatus("not_started")).toBe("not_started");
  });
});

describe("statusCounts", () => {
  it("counts each status", () => {
    expect(
      statusCounts([person("finished"), person("not_started"), person("not_started")]),
    ).toEqual({
      finished: 1,
      in_progress: 0,
      not_started: 2,
    });
  });
});

describe("lessons", () => {
  it("ignores lessons no longer in the live version", () => {
    expect(lessonsDone(person("in_progress", ["a", "old"]), view)).toBe(1);
  });
  it("finds the next lesson, or none when all are done", () => {
    expect(nextLessonKey(person("in_progress", ["a"]), view)).toBe("b");
    expect(nextLessonKey(person("finished", ["a", "b"]), view)).toBeNull();
  });
  it("works out a percent safely", () => {
    expect(lessonPercent(1, 2)).toBe(50);
    expect(lessonPercent(0, 0)).toBe(0);
  });
});

describe("assignableMatches", () => {
  const people = ["Avery Example", "Blake Example", "Casey Example"].map((name) => ({
    userId: name.charAt(0),
    name,
  }));

  it("searches names, ignoring case", () => {
    expect(assignableMatches(people, [], "  bLaKe ").matches.map((p) => p.name)).toEqual([
      "Blake Example",
    ]);
  });

  it("leaves out anyone already assigned", () => {
    expect(assignableMatches(people, ["A"], "").matches.map((p) => p.userId)).toEqual(["B", "C"]);
  });

  it("says when there are more than it shows", () => {
    expect(assignableMatches(people, [], "", 2)).toMatchObject({ more: true });
    expect(assignableMatches(people, [], "", 3)).toMatchObject({ more: false });
  });
});
