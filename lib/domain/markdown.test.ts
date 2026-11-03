import { describe, expect, it } from "vitest";
import { headingId, parseInline, parseMarkdown } from "./markdown";

describe("parseInline", () => {
  it("reads bold, code, and links", () => {
    expect(parseInline("a **b** `c` [d](e.md)")).toEqual([
      { kind: "text", text: "a " },
      { kind: "strong", children: [{ kind: "text", text: "b" }] },
      { kind: "text", text: " " },
      { kind: "code", text: "c" },
      { kind: "text", text: " " },
      { kind: "link", href: "e.md", children: [{ kind: "text", text: "d" }] },
    ]);
  });

  it("reads a link inside bold", () => {
    expect(parseInline("**[a](b.md)**")[0]).toEqual({
      kind: "strong",
      children: [{ kind: "link", href: "b.md", children: [{ kind: "text", text: "a" }] }],
    });
  });

  it("leaves HTML as plain words", () => {
    expect(parseInline("<script>alert(1)</script>")).toEqual([
      { kind: "text", text: "<script>alert(1)</script>" },
    ]);
  });
});

describe("parseMarkdown", () => {
  it("reads headings with their ids", () => {
    expect(parseMarkdown("# One\n\n## Two things")).toEqual([
      { kind: "heading", level: 1, text: "One", id: "one" },
      { kind: "heading", level: 2, text: "Two things", id: "two-things" },
    ]);
  });

  it("joins lines into a paragraph", () => {
    const [block] = parseMarkdown("one\ntwo\n\nthree");
    expect(block).toEqual({ kind: "paragraph", content: [{ kind: "text", text: "one two" }] });
  });

  it("reads bullet and numbered lists, kept apart", () => {
    const blocks = parseMarkdown("- a\n- b\n\n1. c\n2. d");
    expect(blocks.map((block) => block.kind)).toEqual(["list", "list"]);
    expect(blocks[0]).toMatchObject({ ordered: false, items: [{}, {}] });
    expect(blocks[1]).toMatchObject({ ordered: true, items: [{}, {}] });
  });

  it("keeps a list going across blank lines", () => {
    expect(parseMarkdown("1. a\n\n2. b")[0]).toMatchObject({ items: [{}, {}] });
  });

  it("nests an indented list under its item", () => {
    const [block] = parseMarkdown("1. a\n   1. b\n   2. c\n2. d");
    expect(block).toMatchObject({
      kind: "list",
      items: [{ children: { kind: "list", items: [{}, {}] } }, { children: null }],
    });
  });

  it("reads a table", () => {
    const [block] = parseMarkdown("| A | B |\n| --- | --- |\n| 1 | **2** |");
    expect(block).toEqual({
      kind: "table",
      header: [[{ kind: "text", text: "A" }], [{ kind: "text", text: "B" }]],
      rows: [
        [
          [{ kind: "text", text: "1" }],
          [{ kind: "strong", children: [{ kind: "text", text: "2" }] }],
        ],
      ],
    });
  });

  it("keeps code exactly as written", () => {
    expect(parseMarkdown("```bash\na **b**\n  c\n```")[0]).toEqual({
      kind: "code",
      text: "a **b**\n  c",
    });
  });

  it("handles Windows line endings", () => {
    expect(parseMarkdown("# A\r\n\r\nb")).toHaveLength(2);
  });
});

describe("headingId", () => {
  it("makes a tidy address", () => {
    expect(headingId("Who's serving, today?")).toBe("whos-serving-today");
  });
});
