import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { HELP_CONTENT } from "../generated/help-content";
import { adminSections } from "./admin";
import { CAPABILITIES, type CapabilityGrant } from "./capabilities";
import { HELP_PAGES, helpHrefFor, helpLinkTarget, helpPage } from "./help";
import { type Block, type Inline, parseMarkdown } from "./markdown";

const everything: CapabilityGrant[] = CAPABILITIES.map((capability) => ({
  capability,
  departmentId: null,
}));

function linksIn(blocks: Block[]): string[] {
  const fromInline = (inline: Inline[]): string[] =>
    inline.flatMap((part) =>
      part.kind === "link"
        ? [part.href, ...fromInline(part.children)]
        : part.kind === "strong"
          ? fromInline(part.children)
          : [],
    );
  return blocks.flatMap((block): string[] => {
    switch (block.kind) {
      case "paragraph":
        return fromInline(block.content);
      case "list":
        return block.items.flatMap((item) => [
          ...fromInline(item.content),
          ...(item.children ? linksIn([item.children]) : []),
        ]);
      case "table":
        return [...block.header, ...block.rows.flat()].flatMap(fromInline);
      default:
        return [];
    }
  });
}

describe("every part of the app has a guide", () => {
  it("covers every Admin section. A new one needs its guide listed here", () => {
    const covered = new Set(HELP_PAGES.flatMap((page) => page.adminSections ?? []));
    const missing = adminSections(everything)
      .map((section) => section.key)
      .filter((key) => !covered.has(key));
    expect(missing).toEqual([]);
  });

  it("covers every top-level screen. A new one needs its guide listed here", () => {
    const routes = readdirSync("app/(app)", { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !["admin", "help"].includes(entry.name))
      .map((entry) => `/${entry.name}`);
    const covered = HELP_PAGES.flatMap((page) => page.paths ?? []);
    expect(routes.filter((route) => !covered.includes(route))).toEqual([]);
  });

  it("lists every guide and runbook in the folders", () => {
    const listed = new Set(HELP_PAGES.map((page) => page.source));
    const files = ["docs/guides", "docs/runbooks"].flatMap((folder) =>
      readdirSync(folder)
        .filter((name) => name.endsWith(".md") && name !== "README.md")
        .map((name) => `${folder}/${name}`),
    );
    expect(files.filter((file) => !listed.has(file))).toEqual([]);
  });
});

describe("the bundled guides", () => {
  it.each(HELP_PAGES.map((page) => [page.slug, page.source]))(
    "%s matches its file. If not, run npm run help:build",
    (slug, source) => {
      expect(HELP_CONTENT[slug]).toBe(readFileSync(source, "utf8").replace(/\r\n/g, "\n"));
    },
  );

  it.each(HELP_PAGES.map((page) => [page.slug, page.source]))(
    "%s has a title, and its links all go somewhere",
    (slug, source) => {
      const blocks = parseMarkdown(HELP_CONTENT[slug] ?? "");
      expect(blocks[0]).toMatchObject({ kind: "heading", level: 1 });
      const broken = linksIn(blocks).filter((href) => helpLinkTarget(href, source) === null);
      expect(broken).toEqual([]);
    },
  );

  it("has no duplicate addresses", () => {
    const slugs = HELP_PAGES.map((page) => page.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});

describe("helpLinkTarget", () => {
  const from = "docs/guides/training.md";

  it("turns a link to another guide into its page in the app", () => {
    expect(helpLinkTarget("schedule.md", from)).toBe("/help/schedule");
    expect(helpLinkTarget("../runbooks/backups.md", from)).toBe("/help/runbook-backups");
    expect(helpLinkTarget("schedule.md#calendar", from)).toBe("/help/schedule#calendar");
  });

  it("keeps web links", () => {
    expect(helpLinkTarget("https://nodejs.org", from)).toBe("https://nodejs.org");
  });

  it.each(["javascript:alert(1)", "http://insecure.example", "nope.md", "mailto:a@example.com"])(
    "won't link %s",
    (href) => {
      expect(helpLinkTarget(href, from)).toBeNull();
    },
  );
});

describe("helpHrefFor", () => {
  const admin = [
    { key: "overview", href: "/admin" },
    { key: "checklists", href: "/admin/checklists" },
    { key: "branding", href: "/admin/branding" },
  ] as const;

  it("opens the guide for the page you're on", () => {
    expect(helpHrefFor("/schedule", admin)).toBe("/help/schedule");
    expect(helpHrefFor("/courses/abc/lessons/x", admin)).toBe("/help/training");
    expect(helpHrefFor("/service-dashboard/review", admin)).toBe("/help/service-dashboard");
  });

  it("finds an Admin page's guide, preferring the most specific", () => {
    expect(helpHrefFor("/admin", admin)).toBe("/help/admin-overview");
    expect(helpHrefFor("/admin/checklists/history", admin)).toBe("/help/admin-checklists");
    expect(helpHrefFor("/admin/branding", admin)).toBe("/help/service-dashboard");
  });

  it("opens the full list otherwise", () => {
    expect(helpHrefFor("/somewhere-else", admin)).toBe("/help");
    expect(helpHrefFor("/help/training", admin)).toBe("/help");
  });
});

describe("helpPage", () => {
  it("finds a page, or nothing", () => {
    expect(helpPage("training")?.title).toBe("Training");
    expect(helpPage("nope")).toBeNull();
  });
});
