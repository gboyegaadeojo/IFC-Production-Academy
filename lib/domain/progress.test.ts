import { describe, expect, it } from "vitest";
import type { OutlineModule } from "./learning";
import {
  courseProgress,
  courseProgressLabel,
  lessonProgressByKey,
  progressFor,
  recentCourseIds,
  type ProgressRow,
} from "./progress";

const row = (lessonKey: string, overrides: Partial<ProgressRow> = {}): ProgressRow => ({
  lessonKey,
  status: "in_progress",
  positionSeconds: 0,
  lastViewedAt: "2026-10-30T12:00:00Z",
  completedAt: null,
  ...overrides,
});

const done = (lessonKey: string, completedAt = "2026-10-30T12:00:00Z") =>
  row(lessonKey, { status: "completed", completedAt, lastViewedAt: completedAt });

const lesson = (key: string, sortOrder: number, isRequired = true) => ({
  key,
  title: `Lesson ${key}`,
  isRequired,
  estimatedMinutes: 10,
  sortOrder,
});

const modules: OutlineModule[] = [
  {
    id: "m1",
    title: "First",
    summary: "",
    sortOrder: 10,
    lessons: [lesson("a", 10), lesson("b", 20), lesson("x", 30, false)],
  },
  { id: "m2", title: "Second", summary: "", sortOrder: 20, lessons: [lesson("c", 10)] },
];

describe("lessonProgressByKey", () => {
  it("is not started when there are no rows", () => {
    expect(progressFor(lessonProgressByKey([]), "a")).toEqual({
      state: "not_started",
      positionSeconds: 0,
      completedAt: null,
    });
  });

  it("keeps a completion from an earlier version of the lesson (keep policy)", () => {
    const progress = lessonProgressByKey([
      row("a", { lastViewedAt: "2026-10-31T09:00:00Z", positionSeconds: 30 }),
      done("a", "2026-10-29T09:00:00Z"),
    ]);
    expect(progressFor(progress, "a")).toEqual({
      state: "completed",
      completedAt: "2026-10-29T09:00:00Z",
      positionSeconds: 30,
    });
  });

  it("keeps the first completion time and the latest position", () => {
    const progress = lessonProgressByKey([
      done("a", "2026-10-30T10:00:00Z"),
      { ...done("a", "2026-10-28T10:00:00Z"), positionSeconds: 99 },
    ]);
    expect(progressFor(progress, "a").completedAt).toBe("2026-10-28T10:00:00Z");
    expect(progressFor(progress, "a").positionSeconds).toBe(0);
  });
});

describe("courseProgress", () => {
  it("is not started with no progress, and points at the first lesson", () => {
    expect(courseProgress(modules, new Map())).toEqual({
      state: "not_started",
      countedTotal: 3,
      countedCompleted: 0,
      percent: 0,
      next: { key: "a", title: "Lesson a", started: false },
    });
  });

  it("counts required lessons only and continues from the first unfinished one", () => {
    const course = courseProgress(
      modules,
      lessonProgressByKey([done("a"), done("x"), row("b", { positionSeconds: 40 })]),
    );
    expect(course.state).toBe("in_progress");
    expect(course.countedCompleted).toBe(1);
    expect(course.percent).toBe(33);
    expect(course.next).toEqual({ key: "b", title: "Lesson b", started: true });
  });

  it("is completed when every required lesson is, even with optional ones left", () => {
    const course = courseProgress(modules, lessonProgressByKey([done("a"), done("b"), done("c")]));
    expect(course.state).toBe("completed");
    expect(course.percent).toBe(100);
    expect(course.next).toEqual({ key: "x", title: "Lesson x", started: false });
  });

  it("counts every lesson when none is required", () => {
    const optional: OutlineModule[] = [
      { id: "m", title: "Only", summary: "", sortOrder: 10, lessons: [lesson("o", 10, false)] },
    ];
    expect(courseProgress(optional, new Map()).countedTotal).toBe(1);
    expect(courseProgress(optional, lessonProgressByKey([done("o")])).state).toBe("completed");
  });

  it("ignores progress on lessons no longer in the course", () => {
    expect(courseProgress(modules, lessonProgressByKey([done("gone")])).state).toBe("not_started");
  });

  it("is never completed when the course has no lessons", () => {
    expect(courseProgress([], new Map()).state).toBe("not_started");
  });
});

describe("courseProgressLabel", () => {
  it("says how many counted lessons are done", () => {
    const course = courseProgress(modules, lessonProgressByKey([done("a")]));
    expect(courseProgressLabel(course, true)).toBe("1 of 3 required lessons done");
    const finished = courseProgress(
      modules,
      lessonProgressByKey([done("a"), done("b"), done("c")]),
    );
    expect(courseProgressLabel(finished, true)).toBe("All required lessons done");
  });

  it("uses the singular for a one-lesson course", () => {
    const one: OutlineModule[] = [
      { id: "m", title: "Only", summary: "", sortOrder: 10, lessons: [lesson("o", 10, false)] },
    ];
    expect(courseProgressLabel(courseProgress(one, new Map()), false)).toBe("0 of 1 lesson done");
  });
});

describe("recentCourseIds", () => {
  it("returns the newest courses in departments the person still belongs to", () => {
    const activity = new Map([
      ["old", { departmentId: "camera", lastViewedAt: "2026-10-01T00:00:00Z" }],
      ["left", { departmentId: "audio", lastViewedAt: "2026-10-30T00:00:00Z" }],
      ["new", { departmentId: "camera", lastViewedAt: "2026-10-29T00:00:00Z" }],
      ["mid", { departmentId: "camera", lastViewedAt: "2026-10-15T00:00:00Z" }],
    ]);
    expect(recentCourseIds(activity, ["camera"], 2)).toEqual(["new", "mid"]);
  });
});
