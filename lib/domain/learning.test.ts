import { describe, expect, it } from "vitest";
import {
  courseTotals,
  flattenLessons,
  formatMinutes,
  lessonCountLabel,
  lessonPosition,
  orderedOutline,
  paragraphs,
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

  it("splits lesson text into paragraphs on blank lines", () => {
    expect(paragraphs("One\nstill one\n\n  Two  \n\n\n")).toEqual(["One\nstill one", "Two"]);
  });

  it("labels lesson counts", () => {
    expect(lessonCountLabel(1)).toBe("1 lesson");
    expect(lessonCountLabel(3)).toBe("3 lessons");
  });
});
