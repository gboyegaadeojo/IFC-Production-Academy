import { describe, expect, it } from "vitest";
import {
  changeNoteSchema,
  courseDetailsSchema,
  courseState,
  courseStateLabel,
  curriculumErrorMessage,
  lessonSchema,
  nextSortOrder,
  parseObjectives,
  reorder,
  toCurriculumError,
  videoField,
  type VersionSummary,
} from "./curriculum";

const v = (
  id: string,
  status: VersionSummary["status"],
  versionNumber: number | null,
  title = "Framing basics",
): VersionSummary => ({ id, status, versionNumber, title });

describe("courseState", () => {
  it("reads a brand-new course as not published", () => {
    const state = courseState([v("d", "draft", null)], false);
    expect(state).toEqual({ kind: "unpublished", draftId: "d", title: "Framing basics" });
    expect(state && courseStateLabel(state)).toBe("Not published yet");
  });

  it("shows the live version and waiting changes", () => {
    const state = courseState(
      [
        v("a", "superseded", 1),
        v("b", "published", 2, "Live title"),
        v("c", "draft", null, "Draft title"),
      ],
      false,
    );
    expect(state).toEqual({
      kind: "published",
      versionNumber: 2,
      title: "Live title",
      draftId: "c",
      inReview: false,
    });
    expect(state && courseStateLabel(state)).toBe("Version 2 live · unpublished changes");
  });

  it("notes changes waiting for review", () => {
    const state = courseState([v("b", "published", 1), v("c", "pending_review", null)], false);
    expect(state && courseStateLabel(state)).toBe("Version 1 live · changes waiting for review");
  });

  it("reads archived courses as archived", () => {
    const state = courseState([v("a", "archived", 3)], true);
    expect(state?.kind).toBe("archived");
  });
});

describe("parseObjectives", () => {
  it("takes one objective per line and drops bullets and blanks", () => {
    expect(parseObjectives("- Frame a speaker\n\n• Keep headroom  \n* Hold focus")).toEqual([
      "Frame a speaker",
      "Keep headroom",
      "Hold focus",
    ]);
  });
});

describe("courseDetailsSchema", () => {
  it("cleans up titles and accepts empty minutes", () => {
    const parsed = courseDetailsSchema.parse({
      title: "  Framing   basics ",
      summary: "",
      objectives: "",
      estimatedMinutes: "",
    });
    expect(parsed).toEqual({
      title: "Framing basics",
      summary: "",
      objectives: [],
      estimatedMinutes: undefined,
    });
  });

  it("rejects empty titles and too many objectives", () => {
    expect(
      courseDetailsSchema.safeParse({
        title: " ",
        summary: "",
        objectives: "",
        estimatedMinutes: "",
      }).success,
    ).toBe(false);
    const many = Array.from({ length: 21 }, (_, i) => `Objective ${i}`).join("\n");
    expect(
      courseDetailsSchema.safeParse({
        title: "Ok",
        summary: "",
        objectives: many,
        estimatedMinutes: "",
      }).success,
    ).toBe(false);
  });
});

describe("lessonSchema", () => {
  it("limits lesson length to 600 minutes", () => {
    const base = {
      moduleId: "b7ba9dae-cab5-43e0-a996-8ae9d2436855",
      title: "Headroom",
      summary: "",
      objectives: "",
      isRequired: true,
      body: "",
      video: { input: "" },
    };
    expect(lessonSchema.safeParse({ ...base, estimatedMinutes: "15" }).success).toBe(true);
    expect(lessonSchema.safeParse({ ...base, estimatedMinutes: "601" }).success).toBe(false);
  });
});

describe("videoField", () => {
  it("treats an empty value as no video", () => {
    expect(videoField.parse({ input: "  " })).toBeNull();
  });

  it("stores a YouTube link as provider and id (fake id)", () => {
    expect(videoField.parse({ input: "https://youtu.be/AAAAAAAAAAA?si=x" })).toEqual({
      provider: "youtube",
      id: "AAAAAAAAAAA",
    });
  });

  it("explains a link it doesn't recognise", () => {
    const result = videoField.safeParse({ provider: "youtube", input: "https://example.com/v" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toMatch(/YouTube/);
  });

  it("accepts a church video library path", () => {
    expect(videoField.parse({ provider: "nas", input: "camera/level-1/framing.mp4" })).toEqual({
      provider: "nas",
      id: "camera/level-1/framing.mp4",
    });
    expect(videoField.safeParse({ provider: "nas", input: "../secret.mp4" }).success).toBe(false);
  });
});

describe("changeNoteSchema", () => {
  it("needs a note", () => {
    expect(changeNoteSchema.safeParse("   ").success).toBe(false);
    expect(changeNoteSchema.parse(" Added a lesson on headroom ")).toBe(
      "Added a lesson on headroom",
    );
  });
});

describe("reorder", () => {
  const items = [
    { id: "a", sortOrder: 10 },
    { id: "b", sortOrder: 20 },
    { id: "c", sortOrder: 30 },
  ];

  it("moves an item up and renumbers only what changed", () => {
    expect(reorder(items, "c", "up")).toEqual([
      { id: "c", sortOrder: 20 },
      { id: "b", sortOrder: 30 },
    ]);
  });

  it("does nothing at the edges or for unknown ids", () => {
    expect(reorder(items, "a", "up")).toEqual([]);
    expect(reorder(items, "c", "down")).toEqual([]);
    expect(reorder(items, "zzz", "up")).toEqual([]);
  });

  it("puts new items at the end", () => {
    expect(nextSortOrder(items)).toBe(40);
    expect(nextSortOrder([])).toBe(10);
  });
});

describe("toCurriculumError", () => {
  it("maps named errors and hides the rest", () => {
    expect(toCurriculumError({ message: "draft_exists" })).toBe("draft_exists");
    expect(toCurriculumError({ code: "42501", message: "permission denied" })).toBe(
      "not_authorized",
    );
    expect(toCurriculumError({ code: "XX000", message: "secret detail" })).toBe("unknown");
    expect(curriculumErrorMessage("unknown")).not.toContain("secret");
  });
});
