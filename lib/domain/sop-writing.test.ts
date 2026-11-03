import { describe, expect, it } from "vitest";
import { parseMarkdown } from "./markdown";
import { boldSopText, formatSopLines, SOP_TEMPLATE, sopDetailsSchema } from "./sops";

describe("formatSopLines", () => {
  it("numbers every line the selection touches", () => {
    const text = "Intro\nPower on\nCheck inputs\nDone";
    const start = text.indexOf("Power");
    const end = text.indexOf("inputs");
    const result = formatSopLines(text, start, end, "steps");
    expect(result.text).toBe("Intro\n1. Power on\n2. Check inputs\nDone");
    expect(result.cursor).toBe("Intro\n1. Power on\n2. Check inputs".length);
  });

  it("formats the line the cursor is on when nothing is selected", () => {
    expect(formatSopLines("First\nSecond", 8, 8, "heading").text).toBe("First\n## Second");
  });

  it("replaces a format already there instead of stacking them", () => {
    expect(formatSopLines("1. Power on", 3, 3, "bullets").text).toBe("- Power on");
    expect(formatSopLines("- Power on", 3, 3, "warning").text).toBe("! Power on");
    expect(formatSopLines("! Power on", 3, 3, "heading").text).toBe("## Power on");
  });

  it("works on an empty SOP", () => {
    expect(formatSopLines("", 0, 0, "steps").text).toBe("1. ");
  });
});

describe("boldSopText", () => {
  it("makes the selection bold", () => {
    expect(boldSopText("check every camera", 6, 18).text).toBe("check **every camera**");
  });

  it("inserts words to replace when nothing is selected", () => {
    expect(boldSopText("Check ", 6, 6).text).toBe("Check **important words**");
  });
});

describe("what a written SOP becomes", () => {
  it("turns a warning line into a note block", () => {
    expect(parseMarkdown("! Don't unplug this")).toEqual([
      { kind: "note", content: [{ kind: "text", text: "Don't unplug this" }] },
    ]);
  });

  it("ends a paragraph at a warning line", () => {
    expect(parseMarkdown("Some words\n! Careful here").map((block) => block.kind)).toEqual([
      "paragraph",
      "note",
    ]);
  });

  it("gives the template headings, steps, and a warning", () => {
    const kinds = parseMarkdown(SOP_TEMPLATE).map((block) => block.kind);
    expect(kinds).toContain("heading");
    expect(kinds).toContain("list");
    expect(kinds).toContain("note");
  });

  it("keeps anything that looks like HTML as plain words", () => {
    expect(parseMarkdown("<script>alert(1)</script>")).toEqual([
      { kind: "paragraph", content: [{ kind: "text", text: "<script>alert(1)</script>" }] },
    ]);
  });
});

describe("sopDetailsSchema", () => {
  const valid = { title: "Stream start-up", summary: "", body: "" };

  it("allows a draft with no steps yet, and keeps the writer's line breaks", () => {
    expect(sopDetailsSchema.safeParse(valid).success).toBe(true);
    expect(sopDetailsSchema.parse({ ...valid, body: "1. One\n2. Two\n" }).body).toBe(
      "1. One\n2. Two\n",
    );
  });

  it("limits how long the steps can be", () => {
    expect(sopDetailsSchema.safeParse({ ...valid, body: "x".repeat(50_001) }).success).toBe(false);
  });
});
