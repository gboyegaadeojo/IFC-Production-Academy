import { describe, expect, it } from "vitest";
import {
  activityActionLabel,
  activityChange,
  activityOutcomeLabel,
  canSwitchCurrentService,
  checklistErrorMessage,
  groupServiceChecklists,
  groupServiceRecord,
  parseChecklistText,
  percentDone,
  progressLabel,
  hideBlocker,
  removeWarning,
  restoreWithParentsLabel,
  sameListName,
  tidyListName,
  toChecklistError,
  type RecordRow,
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

describe("activity log wording", () => {
  it("names actions and outcomes", () => {
    expect(activityActionLabel("check")).toBe("Ticked");
    expect(activityActionLabel("something_new")).toBe("something new");
    expect(activityOutcomeLabel("refused", "checklist_closed")).toMatch(
      /^Refused: This checklist opens/,
    );
    expect(activityOutcomeLabel("unchanged", null)).toBe("No change");
    expect(activityOutcomeLabel("ok", null)).toBeNull();
  });

  it("shows what changed", () => {
    expect(activityChange({ text: "Power on" }, { text: "Power on everything" })).toBe(
      "“Power on” → “Power on everything”",
    );
    expect(activityChange(null, { cleared: 1 })).toBe("1 tick cleared");
    expect(activityChange({ sort_order: 10 }, { sort_order: 20 })).toBeNull();
  });
});

describe("groupServiceRecord", () => {
  const row = (checklistId: string, itemId: string, extra: Partial<RecordRow> = {}): RecordRow => ({
    checklistId,
    checklistName: checklistId === "cam" ? "Camera Operators" : "Audio Engineer",
    sectionName: "Setup",
    itemId,
    itemText: itemId,
    checkedText: null,
    checkedByName: null,
    checkedAt: null,
    removedAt: null,
    ...extra,
  });

  it("counts done and not done per department, leaving out tasks removed during the service", () => {
    const record = groupServiceRecord([
      row("cam", "a", {
        checkedAt: "2026-11-08T15:00:00Z",
        checkedByName: "Avery",
        checkedText: "a (old)",
      }),
      row("cam", "b"),
      row("cam", "c", { removedAt: "2026-11-08T14:00:00Z" }),
      row("aud", "d", { checkedAt: "2026-11-08T15:05:00Z", checkedText: "d" }),
    ]);
    expect([record.done, record.total]).toEqual([2, 3]);
    expect(record.departments.map((d) => [d.name, d.done, d.total, d.removed.length])).toEqual([
      ["Camera Operators", 1, 2, 1],
      ["Audio Engineer", 1, 1, 0],
    ]);
    expect(record.departments[0]!.doneTasks[0]!.checkedUnder).toBe("a (old)");
    expect(record.departments[1]!.doneTasks[0]!.checkedUnder).toBeNull();
    expect(record.departments[0]!.notDone.map((t) => t.id)).toEqual(["b"]);
  });
});

describe("task lists", () => {
  it("tidies names and compares them ignoring capitals and extra spaces", () => {
    expect(tidyListName("  Christmas   Eve ")).toBe("Christmas Eve");
    expect(sameListName("christmas  EVE", " Christmas Eve")).toBe(true);
    expect(sameListName("Christmas", "Christmas Eve")).toBe(false);
  });

  it("never hides the default list or one a service is using", () => {
    expect(hideBlocker({ isDefault: true, inUse: true })).toMatch(/default list/);
    expect(hideBlocker({ isDefault: false, inUse: true })).toMatch(/service is using/);
    expect(hideBlocker({ isDefault: false, inUse: false })).toBeNull();
  });

  it("offers to switch the current service only before anything is ticked", () => {
    expect(canSwitchCurrentService(null, "b")).toBe(false);
    expect(canSwitchCurrentService({ setId: "a", hasCheckoffs: false }, "b")).toBe(true);
    expect(canSwitchCurrentService({ setId: "a", hasCheckoffs: true }, "b")).toBe(false);
    expect(canSwitchCurrentService({ setId: "b", hasCheckoffs: false }, "b")).toBe(false);
  });

  it("explains the list errors the database gives", () => {
    for (const reason of [
      "name_taken",
      "list_hidden",
      "list_not_found",
      "list_in_use",
      "service_has_checkoffs",
    ] as const) {
      expect(toChecklistError({ message: reason })).toBe(reason);
      expect(checklistErrorMessage(reason)).not.toMatch(/connection/);
    }
  });
});

describe("hidden items", () => {
  it("warns about the tasks, and position links, that go with a removal", () => {
    expect(removeWarning("section", 3)).toMatch(/^Its 3 tasks go with it\./);
    expect(removeWarning("section", 1)).toMatch(/^Its 1 task goes with it\./);
    expect(removeWarning("section", 0)).toMatch(/^It has no tasks\./);
    expect(removeWarning("checklist", 2, 2)).toMatch(/links to 2 positions are removed/);
    expect(removeWarning("checklist", 2, 1)).toMatch(/link to a position is removed/);
    expect(removeWarning("section", 2, 5)).not.toMatch(/position/);
    expect(removeWarning("checklist", 2)).toMatch(/restore it from Hidden items/);
  });

  it("says what comes back with a restore inside something hidden", () => {
    expect(restoreWithParentsLabel("item")).toMatch(/section and checklist/);
    expect(restoreWithParentsLabel("section")).toBe("Restore it with its checklist");
  });
});
