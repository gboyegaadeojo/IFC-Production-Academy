import { describe, expect, it } from "vitest";
import { goalOverdue, goalSchema, noteSchema, toMentoringError } from "./mentoring";

describe("goalSchema", () => {
  it("tidies the title and allows no due date", () => {
    expect(goalSchema.parse({ title: "  Run   the switcher ", dueOn: "" })).toEqual({
      title: "Run the switcher",
      dueOn: null,
    });
    expect(goalSchema.parse({ title: "A", dueOn: "2026-12-01" }).dueOn).toBe("2026-12-01");
    expect(goalSchema.safeParse({ title: " ", dueOn: "" }).success).toBe(false);
  });
});

describe("noteSchema", () => {
  it("needs words and a visibility", () => {
    expect(noteSchema.safeParse({ body: "Great work", visibility: "shared" }).success).toBe(true);
    expect(noteSchema.safeParse({ body: "  ", visibility: "shared" }).success).toBe(false);
    expect(noteSchema.safeParse({ body: "x", visibility: "public" }).success).toBe(false);
  });
});

describe("goalOverdue", () => {
  it("is only for open goals past their date", () => {
    expect(goalOverdue({ status: "open", dueOn: "2026-11-01" }, "2026-11-02")).toBe(true);
    expect(goalOverdue({ status: "open", dueOn: "2026-11-02" }, "2026-11-02")).toBe(false);
    expect(goalOverdue({ status: "done", dueOn: "2026-11-01" }, "2026-11-02")).toBe(false);
    expect(goalOverdue({ status: "open", dueOn: null }, "2026-11-02")).toBe(false);
  });
});

describe("toMentoringError", () => {
  it("maps database errors", () => {
    expect(toMentoringError({ message: "mentor_not_eligible" })).toBe("mentor_not_eligible");
    expect(toMentoringError({ code: "42501", message: "new row violates" })).toBe("not_authorized");
    expect(toMentoringError({ code: "XX000", message: "secret" })).toBe("unknown");
  });
});
