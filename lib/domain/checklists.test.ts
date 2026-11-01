import { describe, expect, it } from "vitest";
import {
  groupServiceChecklists,
  parseChecklistText,
  percentDone,
  progressLabel,
  toChecklistError,
  type ServiceChecklistRow,
} from "./checklists";

describe("parseChecklistText", () => {
  it("reads headings and items, dropping list markers", () => {
    expect(
      parseChecklistText(
        [
          "Power on the rack",
          "",
          "## Before the service",
          "- [ ] Check the batteries",
          "* Test the talkback",
          "1. Frame the wide shot",
          "# Empty section",
          "#   After",
          "• Cap the lenses",
        ].join("\n"),
      ),
    ).toEqual([
      { name: "General", items: ["Power on the rack"] },
      {
        name: "Before the service",
        items: ["Check the batteries", "Test the talkback", "Frame the wide shot"],
      },
      { name: "After", items: ["Cap the lenses"] },
    ]);
  });

  it("cuts over-long lines to fit", () => {
    const [section] = parseChecklistText(`# ${"s".repeat(200)}\n${"x".repeat(400)}`);
    expect(section!.name).toHaveLength(120);
    expect(section!.items[0]).toHaveLength(300);
  });
});

describe("groupServiceChecklists", () => {
  const row = (
    checklistId: string,
    sectionId: string,
    itemId: string,
    checked: boolean,
  ): ServiceChecklistRow => ({
    checklistId,
    checklistName: checklistId === "cam" ? "Camera Operators" : "Audio Engineer",
    departmentName: checklistId === "cam" ? "Camera Operations" : "Audio",
    isMine: checklistId === "cam",
    sectionId,
    sectionName: sectionId,
    itemId,
    itemText: itemId,
    checkedByName: checked ? "Avery" : null,
    checkedAt: checked ? "2026-11-08T15:00:00Z" : null,
  });

  it("groups rows into checklists and sections, with progress", () => {
    const grouped = groupServiceChecklists([
      row("cam", "Setup", "a", true),
      row("cam", "Setup", "b", false),
      row("cam", "Shutdown", "c", true),
      row("aud", "Setup", "d", false),
    ]);
    expect(grouped.map((c) => [c.name, c.done, c.total, c.isMine])).toEqual([
      ["Camera Operators", 2, 3, true],
      ["Audio Engineer", 0, 1, false],
    ]);
    expect(grouped[0]!.sections.map((s) => s.items.length)).toEqual([2, 1]);
  });

  it("words progress plainly", () => {
    expect(progressLabel(2, 3)).toBe("2 of 3 done");
    expect(progressLabel(3, 3)).toBe("All done");
    expect(percentDone(1, 3)).toBe(33);
    expect(percentDone(0, 0)).toBe(0);
  });

  it("maps database errors", () => {
    expect(toChecklistError({ message: "checklist_closed" })).toBe("checklist_closed");
    expect(toChecklistError({ code: "42501", message: "x" })).toBe("not_authorized");
    expect(toChecklistError({ code: "XX000", message: "secret" })).toBe("unknown");
  });
});
