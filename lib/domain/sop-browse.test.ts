import { describe, expect, it } from "vitest";
import { highlightParts, recentlyUpdated } from "./sops";

describe("recentlyUpdated", () => {
  const sop = (title: string, publishedAt: string | null) => ({ title, publishedAt });

  it("lists the newest first and leaves out anything never published", () => {
    expect(
      recentlyUpdated([
        sop("Old", "2026-01-01T00:00:00Z"),
        sop("Never", null),
        sop("New", "2026-10-01T00:00:00Z"),
      ]).map((item) => item.title),
    ).toEqual(["New", "Old"]);
  });

  it("stops at the limit", () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      sop(`SOP ${i}`, `2026-01-${10 + i}T00:00:00Z`),
    );
    expect(recentlyUpdated(many)).toHaveLength(10);
    expect(recentlyUpdated(many, 3)[0]?.title).toBe("SOP 11");
  });
});

describe("highlightParts", () => {
  it("marks each word searched for, in any case", () => {
    expect(highlightParts("Stream start-up", "STREAM up")).toEqual([
      { text: "Stream", match: true },
      { text: " start-", match: false },
      { text: "up", match: true },
    ]);
  });

  it("returns the whole text when nothing is searched for", () => {
    expect(highlightParts("Stream start-up", "  ")).toEqual([
      { text: "Stream start-up", match: false },
    ]);
  });

  it("treats special characters as plain text", () => {
    expect(highlightParts("Mix (audio) 1+1", "(audio) 1+1")).toEqual([
      { text: "Mix ", match: false },
      { text: "(audio)", match: true },
      { text: " ", match: false },
      { text: "1+1", match: true },
    ]);
  });
});
