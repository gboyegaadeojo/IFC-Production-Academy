import { describe, expect, it } from "vitest";
import { parseInline, parseMarkdown } from "./markdown";
import { docToMarkdown, looksLikeMarkdown, markdownToDoc, underPageTitle } from "./rich-text";

describe("rich text", () => {
  it("reads bold, italic, and underline", () => {
    expect(parseInline("a **b** *c* __d__")).toEqual([
      { kind: "text", text: "a " },
      { kind: "strong", children: [{ kind: "text", text: "b" }] },
      { kind: "text", text: " " },
      { kind: "em", children: [{ kind: "text", text: "c" }] },
      { kind: "text", text: " " },
      { kind: "underline", children: [{ kind: "text", text: "d" }] },
    ]);
  });

  it("leaves a lone star and a snake_case word alone", () => {
    expect(parseInline("2 * 3 and some_word")).toEqual([
      { kind: "text", text: "2 * 3 and some_word" },
    ]);
  });

  it.each([
    "# The Heart of Serving\n\nServing begins with **faith** and *joy*.",
    "## Why\n\n__Show up__ on time.",
    "- One\n- Two\n  - Nested",
    "1. First\n2. Second",
    "Read [the guide](https://example.com/guide) first.",
    "[**Bold link**](https://example.com)",
  ])("keeps %j through the editor unchanged", (source) => {
    expect(docToMarkdown(markdownToDoc(source))).toBe(source);
  });

  it("gives an empty editor one empty paragraph, and saves it as nothing", () => {
    const doc = markdownToDoc("");
    expect(doc.content).toEqual([{ type: "paragraph" }]);
    expect(docToMarkdown(doc)).toBe("");
  });

  it("keeps old plain text readable", () => {
    expect(docToMarkdown(markdownToDoc("One line.\n\nAnother line."))).toBe(
      "One line.\n\nAnother line.",
    );
  });

  it("spots pasted Markdown, and not ordinary text", () => {
    expect(looksLikeMarkdown("# Heading\n\nText")).toBe(true);
    expect(looksLikeMarkdown("Some **bold** text")).toBe(true);
    expect(looksLikeMarkdown("Just a sentence.")).toBe(false);
  });

  it("starts headings below the page title", () => {
    const levels = underPageTitle(parseMarkdown("# A\n\n## B\n\n### C")).map((block) =>
      block.kind === "heading" ? block.level : 0,
    );
    expect(levels).toEqual([2, 3, 3]);
  });
});
