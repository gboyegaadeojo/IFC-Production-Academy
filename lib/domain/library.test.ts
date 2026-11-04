import { describe, expect, it } from "vitest";
import {
  courseFacts,
  coverImageType,
  filterLibrary,
  libraryRows,
  type LibraryCourse,
} from "./library";

const category = (id: string, kind: "team" | "topic", sortOrder: number) => ({
  id,
  slug: id,
  name: id,
  kind,
  hue: "blue",
  icon: "camera",
  sortOrder,
});
const course = (
  id: string,
  cat: LibraryCourse["category"],
  level: number | null,
): LibraryCourse => ({
  id,
  title: id,
  href: `/courses/${id}`,
  category: cat,
  level,
  sortOrder: 0,
  lessonCount: 2,
  estimatedMinutes: null,
  coverUrl: null,
  topicIds: id === "Framing" ? ["t1"] : [],
  percent: 0,
  state: "not_started",
});
const camera = category("camera", "team", 10);
const general = category("general", "topic", 1);
const all = [
  course("Framing", camera, 2),
  course("Basics", camera, 1),
  course("Guide to Serving", general, null),
];

describe("libraryRows", () => {
  it("puts topics first and orders courses by level", () => {
    expect(libraryRows(all).map((row) => [row.category.id, row.courses.map((c) => c.id)])).toEqual([
      ["general", ["Guide to Serving"]],
      ["camera", ["Basics", "Framing"]],
    ]);
  });
  it("has no row for a category with no courses", () => {
    expect(libraryRows([])).toEqual([]);
  });
});

describe("filterLibrary", () => {
  const none = { search: "", categoryId: "", level: "", topicIds: [] };
  it("finds by title, ignoring case", () => {
    expect(filterLibrary(all, { ...none, search: "GUIDE" }).map((c) => c.id)).toEqual([
      "Guide to Serving",
    ]);
  });
  it("filters by category and level together", () => {
    expect(
      filterLibrary(all, { ...none, categoryId: "camera", level: "2" }).map((c) => c.id),
    ).toEqual(["Framing"]);
  });
  it("matches any chosen topic", () => {
    expect(filterLibrary(all, { ...none, topicIds: ["t1", "t2"] }).map((c) => c.id)).toEqual([
      "Framing",
    ]);
    expect(filterLibrary(all, { ...none, topicIds: ["t2"] })).toEqual([]);
  });
  it("leaves out courses with no level when a level is chosen", () => {
    expect(filterLibrary(all, { ...none, level: "1" }).map((c) => c.id)).toEqual(["Basics"]);
  });
});

describe("courseFacts", () => {
  it("leaves out what isn't known", () => {
    expect(courseFacts({ level: null, lessonCount: 1, estimatedMinutes: null })).toBe("1 lesson");
    expect(courseFacts({ level: 1, lessonCount: 5, estimatedMinutes: 40 })).toBe(
      "Level 1 · 5 lessons · 40 min",
    );
  });
});

describe("coverImageType", () => {
  it("goes by the file's bytes", () => {
    expect(coverImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))?.extension).toBe("png");
    expect(coverImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))?.extension).toBe("jpg");
    const webp = new TextEncoder().encode("RIFF0000WEBP");
    expect(coverImageType(webp)?.extension).toBe("webp");
    expect(coverImageType(new TextEncoder().encode("<svg></svg>"))).toBeNull();
  });
});
