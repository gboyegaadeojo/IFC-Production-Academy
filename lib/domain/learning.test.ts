import { describe, expect, it } from "vitest";
import {
  courseSections,
  courseSteps,
  courseTotals,
  flattenLessons,
  formatMinutes,
  lessonCountLabel,
  lessonPosition,
  orderedOutline,
  stepHref,
  type OutlineModule,
} from "./learning";

const lesson = (
  key: string,
  sortOrder: number,
  minutes: number | null = 10,
  isRequired = true,
) => ({
  key,
  title: `Lesson ${key}`,
  isRequired,
  estimatedMinutes: minutes,
  sortOrder,
});

const modules: OutlineModule[] = [
  { id: "m2", title: "Second", summary: "", sortOrder: 20, lessons: [lesson("c", 10)] },
  {
    id: "m1",
    title: "First",
    summary: "",
    sortOrder: 10,
    lessons: [lesson("b", 20, 15, false), lesson("a", 10)],
  },
];

describe("orderedOutline and flattenLessons", () => {
  it("puts modules and lessons in teaching order", () => {
    expect(orderedOutline(modules).map((m) => m.id)).toEqual(["m1", "m2"]);
    expect(flattenLessons(modules).map((l) => `${l.moduleTitle}:${l.key}`)).toEqual([
      "First:a",
      "First:b",
      "Second:c",
    ]);
  });
});

describe("lessonPosition", () => {
  it("finds previous and next across modules", () => {
    expect(lessonPosition(modules, "b")).toEqual({
      index: 1,
      total: 3,
      previous: { key: "a", title: "Lesson a" },
      next: { key: "c", title: "Lesson c" },
    });
  });

  it("has no previous at the start and no next at the end", () => {
    expect(lessonPosition(modules, "a")?.previous).toBeNull();
    expect(lessonPosition(modules, "c")?.next).toBeNull();
  });

  it("returns null for a lesson that isn't in this version", () => {
    expect(lessonPosition(modules, "zzz")).toBeNull();
  });
});

describe("courseSections", () => {
  const quiz = (key: string, afterModuleId: string | null) => ({
    key,
    title: key,
    isRequired: true,
    afterModuleId,
  });
  const twoModules: OutlineModule[] = [
    { id: "second", title: "Second", summary: "", sortOrder: 2, lessons: [] },
    { id: "first", title: "First", summary: "", sortOrder: 1, lessons: [] },
  ];

  it("puts modules in teaching order, each with what follows it", () => {
    const sections = courseSections(twoModules, [quiz("q", "first")], [quiz("p", "second")]);
    expect(sections.modules.map((s) => [s.module.id, s.checks.map((c) => c.key)])).toEqual([
      ["first", ["q"]],
      ["second", ["p"]],
    ]);
    expect(sections.modules[0]?.checks[0]?.kind).toBe("quiz");
    expect(sections.modules[1]?.checks[0]?.kind).toBe("practical");
    expect(sections.endChecks).toEqual([]);
  });

  it("closes the course with anything not placed after a module", () => {
    const sections = courseSections(twoModules, [quiz("gone", "removed")], [quiz("final", null)]);
    expect(sections.endChecks.map((c) => c.key)).toEqual(["gone", "final"]);
  });
});

describe("courseTotals", () => {
  it("counts required and optional lessons and sums estimates", () => {
    expect(courseTotals(modules)).toEqual({
      lessons: 3,
      required: 2,
      optional: 1,
      estimatedMinutes: 35,
    });
  });

  it("never guesses a duration when any lesson lacks an estimate", () => {
    const partial: OutlineModule[] = [
      {
        id: "m",
        title: "M",
        summary: "",
        sortOrder: 1,
        lessons: [lesson("a", 1), lesson("b", 2, null)],
      },
    ];
    expect(courseTotals(partial).estimatedMinutes).toBeNull();
    expect(courseTotals([]).estimatedMinutes).toBeNull();
  });
});

describe("formatting", () => {
  it("formats minutes", () => {
    expect(formatMinutes(45)).toBe("45 min");
    expect(formatMinutes(60)).toBe("1 h");
    expect(formatMinutes(90)).toBe("1 h 30 min");
  });

  it("labels lesson counts", () => {
    expect(lessonCountLabel(1)).toBe("1 lesson");
    expect(lessonCountLabel(3)).toBe("3 lessons");
  });
});

describe("courseSteps", () => {
  const outline = [
    {
      id: "m2",
      title: "Second",
      summary: "",
      sortOrder: 20,
      lessons: [{ key: "c", title: "C", isRequired: true, estimatedMinutes: null, sortOrder: 10 }],
    },
    {
      id: "m1",
      title: "First",
      summary: "",
      sortOrder: 10,
      lessons: [{ key: "a", title: "A", isRequired: true, estimatedMinutes: null, sortOrder: 10 }],
    },
  ];

  it("puts quizzes after their module and the rest at the end", () => {
    const steps = courseSteps(outline, [
      { key: "end", title: "Final", isRequired: true, afterModuleId: null },
      { key: "gone", title: "Orphan", isRequired: true, afterModuleId: "removed" },
      { key: "q1", title: "After first", isRequired: true, afterModuleId: "m1" },
    ]);
    expect(steps.map((step) => step.key)).toEqual(["a", "q1", "c", "end", "gone"]);
    expect(steps[1]?.kind).toBe("quiz");
    expect(stepHref("course", { kind: "quiz", key: "q1" })).toBe("/courses/course/quizzes/q1");
    expect(stepHref("course", { kind: "lesson", key: "a" })).toBe("/courses/course/lessons/a");
  });
});
