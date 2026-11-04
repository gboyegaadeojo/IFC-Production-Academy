/**
 * Rich text for course summaries and lesson text (SRS-CUR-016). It's stored as Markdown, so text
 * written before the editor keeps working and history is never rewritten, and it's drawn from plain
 * data, so nothing in it can run as HTML. These turn Markdown into the editor's document and back.
 */
import { parseInline, parseMarkdown, type Block, type Inline, type ListItem } from "./markdown";

export const COURSE_SUMMARY_MAX = 5000;
export const LESSON_SUMMARY_MAX = 5000;
export const LESSON_BODY_MAX = 20000;

type Mark = { type: string; attrs?: Record<string, unknown> };
/** The shape of the editor's document, without depending on the editor. */
export type RichNode = {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: RichNode[];
  marks?: Mark[];
  text?: string;
};

function inlineNodes(parts: Inline[], marks: Mark[] = []): RichNode[] {
  return parts.flatMap((part): RichNode[] => {
    switch (part.kind) {
      case "text":
        return part.text
          ? [{ type: "text", text: part.text, ...(marks.length ? { marks } : {}) }]
          : [];
      case "code":
        return [{ type: "text", text: part.text, marks: [...marks, { type: "code" }] }];
      case "strong":
        return inlineNodes(part.children, [...marks, { type: "bold" }]);
      case "em":
        return inlineNodes(part.children, [...marks, { type: "italic" }]);
      case "underline":
        return inlineNodes(part.children, [...marks, { type: "underline" }]);
      case "link":
        return inlineNodes(part.children, [...marks, { type: "link", attrs: { href: part.href } }]);
    }
  });
}

function paragraph(parts: Inline[]): RichNode {
  const content = inlineNodes(parts);
  return content.length ? { type: "paragraph", content } : { type: "paragraph" };
}

function listNode(ordered: boolean, items: ListItem[]): RichNode {
  return {
    type: ordered ? "orderedList" : "bulletList",
    content: items.map((item) => ({
      type: "listItem",
      content: [paragraph(item.content), ...(item.children ? blockNodes(item.children) : [])],
    })),
  };
}

function blockNodes(block: Block): RichNode[] {
  switch (block.kind) {
    case "heading":
      return [
        {
          type: "heading",
          attrs: { level: block.level },
          content: inlineNodes(parseInline(block.text)),
        },
      ];
    case "paragraph":
      return [paragraph(block.content)];
    // The editor has no warning notes or tables, so these stay as readable lines of text.
    case "note":
      return [paragraph([{ kind: "text", text: "Careful: " }, ...block.content])];
    case "list":
      return [listNode(block.ordered, block.items)];
    case "code":
      return [
        { type: "codeBlock", content: block.text ? [{ type: "text", text: block.text }] : [] },
      ];
    case "table":
      return [block.header, ...block.rows].map((row) =>
        paragraph(
          row.flatMap((cell, index) =>
            index ? [{ kind: "text" as const, text: " | " }, ...cell] : cell,
          ),
        ),
      );
  }
}

export function markdownToDoc(source: string): RichNode {
  const content = parseMarkdown(source).flatMap(blockNodes);
  return { type: "doc", content: content.length ? content : [{ type: "paragraph" }] };
}

function textWithMarks(node: RichNode): string {
  if (node.type === "hardBreak") {
    return " ";
  }
  let text = node.text ?? "";
  const marks = node.marks ?? [];
  if (marks.some((mark) => mark.type === "code")) {
    text = `\`${text}\``;
  }
  if (marks.some((mark) => mark.type === "italic")) {
    text = `*${text}*`;
  }
  if (marks.some((mark) => mark.type === "underline")) {
    text = `__${text}__`;
  }
  if (marks.some((mark) => mark.type === "bold")) {
    text = `**${text}**`;
  }
  const link = marks.find((mark) => mark.type === "link");
  return link ? `[${text}](${String(link.attrs?.href ?? "")})` : text;
}

const inlineText = (node: RichNode) => (node.content ?? []).map(textWithMarks).join("");

function listText(node: RichNode, indent: string): string {
  const ordered = node.type === "orderedList";
  return (node.content ?? [])
    .map((item, index) => {
      const marker = ordered ? `${index + 1}. ` : "- ";
      const [first, ...rest] = item.content ?? [];
      const nested = rest
        .filter((child) => child.type === "bulletList" || child.type === "orderedList")
        .map((child) => listText(child, `${indent}${" ".repeat(marker.length)}`));
      return [`${indent}${marker}${first ? inlineText(first) : ""}`, ...nested].join("\n");
    })
    .join("\n");
}

export function docToMarkdown(doc: RichNode): string {
  return (doc.content ?? [])
    .flatMap((node) => {
      switch (node.type) {
        case "heading":
          return [`${"#".repeat(Number(node.attrs?.level ?? 2))} ${inlineText(node)}`];
        case "bulletList":
        case "orderedList":
          return [listText(node, "")];
        case "codeBlock":
          return [
            `\`\`\`\n${(node.content ?? []).map((child) => child.text ?? "").join("")}\n\`\`\``,
          ];
        default: {
          const text = inlineText(node);
          return text.trim() ? [text] : [];
        }
      }
    })
    .join("\n\n");
}

/** Pasted plain text that uses Markdown, such as "# Heading", should become real formatting. */
export function looksLikeMarkdown(text: string): boolean {
  return /^(#{1,3}\s|[-*]\s|\d+\.\s)|\*\*.+?\*\*/m.test(text);
}

/** A lesson or course page already has its title, so text starts one heading level below it. */
export function underPageTitle(blocks: Block[]): Block[] {
  return blocks.map((block) =>
    block.kind === "heading" && block.level < 3
      ? { ...block, level: (block.level + 1) as 2 | 3 }
      : block,
  );
}
