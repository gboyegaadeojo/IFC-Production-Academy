/**
 * Just enough Markdown for the guides and course text (ADD-HELP-01, SRS-CUR-016): headings,
 * paragraphs, lists, tables, code, and inline bold, italic, underline (__like this__), code, and links. It makes plain data for React to draw, so nothing in a guide can
 * ever run as HTML.
 */

export type Inline =
  | { kind: "text"; text: string }
  | { kind: "strong"; children: Inline[] }
  | { kind: "em"; children: Inline[] }
  | { kind: "underline"; children: Inline[] }
  | { kind: "code"; text: string }
  | { kind: "link"; href: string; children: Inline[] };

export type ListItem = { content: Inline[]; children: Block | null };

export type Block =
  | { kind: "heading"; level: 1 | 2 | 3; text: string; id: string }
  | { kind: "paragraph"; content: Inline[] }
  /** A line starting "! ": a warning, for SOPs written in the app. */
  | { kind: "note"; content: Inline[] }
  | { kind: "list"; ordered: boolean; items: ListItem[] }
  | { kind: "table"; header: Inline[][]; rows: Inline[][][] }
  | { kind: "code"; text: string };

export function headingId(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

const INLINE =
  /(\*\*(.+?)\*\*)|(`([^`]+)`)|(\[([^\]]+)\]\(([^)\s]+)\))|(__(.+?)__)|(\*([^*\s](?:[^*]*[^*\s])?)\*)/;

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let rest = text;
  while (rest.length > 0) {
    const match = INLINE.exec(rest);
    if (!match) {
      out.push({ kind: "text", text: rest });
      break;
    }
    if (match.index > 0) {
      out.push({ kind: "text", text: rest.slice(0, match.index) });
    }
    if (match[2] !== undefined) {
      out.push({ kind: "strong", children: parseInline(match[2]) });
    } else if (match[4] !== undefined) {
      out.push({ kind: "code", text: match[4] });
    } else if (match[9] !== undefined) {
      out.push({ kind: "underline", children: parseInline(match[9]) });
    } else if (match[11] !== undefined) {
      out.push({ kind: "em", children: parseInline(match[11]) });
    } else {
      out.push({
        kind: "link",
        href: match[7] ?? "",
        children: parseInline(match[6] ?? ""),
      });
    }
    rest = rest.slice(match.index + match[0].length);
  }
  return out;
}

function tableCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\||\|$/g, "")
    .split(/(?<!\\)\|/)
    .map((cell) => cell.trim().replaceAll("\\|", "|"));
}

const ITEM = /^(\s*)([-*]|\d+\.)\s+(.*)$/;
const BLOCK_START = /^(#{1,3}\s|```|\||!\s|\s*(?:[-*]|\d+\.)\s)/;

export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let index = 0;

  function parseList(indent: number): Block {
    const first = ITEM.exec(lines[index] ?? "");
    const ordered = /\d/.test(first?.[2] ?? "");
    const items: ListItem[] = [];
    while (index < lines.length) {
      const match = ITEM.exec(lines[index] ?? "");
      if (!match || (match[1] ?? "").length < indent) {
        // A blank line between items keeps the list going.
        if ((lines[index] ?? "").trim() === "" && ITEM.exec(lines[index + 1] ?? "")) {
          const next = ITEM.exec(lines[index + 1] ?? "");
          if ((next?.[1] ?? "").length >= indent && /\d/.test(next?.[2] ?? "") === ordered) {
            index += 1;
            continue;
          }
        }
        break;
      }
      if ((match[1] ?? "").length > indent) {
        const last = items.at(-1);
        if (last) {
          last.children = parseList((match[1] ?? "").length);
          continue;
        }
      }
      if (/\d/.test(match[2] ?? "") !== ordered) {
        break;
      }
      index += 1;
      items.push({ content: parseInline(match[3] ?? ""), children: null });
    }
    return { kind: "list", ordered, items };
  }

  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (line.trim() === "") {
      index += 1;
      continue;
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      const text = heading[2] ?? "";
      blocks.push({
        kind: "heading",
        level: (heading[1] ?? "#").length as 1 | 2 | 3,
        text,
        id: headingId(text),
      });
      index += 1;
      continue;
    }
    if (line.startsWith("! ")) {
      blocks.push({ kind: "note", content: parseInline(line.slice(2).trim()) });
      index += 1;
      continue;
    }
    if (line.startsWith("```")) {
      index += 1;
      const code: string[] = [];
      while (index < lines.length && !(lines[index] ?? "").startsWith("```")) {
        code.push(lines[index] ?? "");
        index += 1;
      }
      index += 1;
      blocks.push({ kind: "code", text: code.join("\n") });
      continue;
    }
    if (line.startsWith("|") && /^\|[\s:|-]+\|?\s*$/.test(lines[index + 1] ?? "")) {
      const header = tableCells(line).map(parseInline);
      index += 2;
      const rows: Inline[][][] = [];
      while ((lines[index] ?? "").startsWith("|")) {
        rows.push(tableCells(lines[index] ?? "").map(parseInline));
        index += 1;
      }
      blocks.push({ kind: "table", header, rows });
      continue;
    }
    if (ITEM.test(line)) {
      blocks.push(parseList((ITEM.exec(line)?.[1] ?? "").length));
      continue;
    }
    const paragraph: string[] = [line.trim()];
    index += 1;
    while (
      index < lines.length &&
      (lines[index] ?? "").trim() !== "" &&
      !BLOCK_START.test(lines[index] ?? "")
    ) {
      paragraph.push((lines[index] ?? "").trim());
      index += 1;
    }
    blocks.push({ kind: "paragraph", content: parseInline(paragraph.join(" ")) });
  }
  return blocks;
}
