import { describe, expect, it } from "vitest";
import { alertSummary, sortForFollowUp, toAlertStatus } from "./alerts";

describe("the list of who has alerts on", () => {
  it("puts who to follow up with first, then by name", () => {
    const people = [
      { status: "on" as const, displayName: "Avery" },
      { status: "off" as const, displayName: "Casey" },
      { status: "off" as const, displayName: "Blake" },
      { status: "cannot" as const, displayName: "Drew" },
      { status: "computer_only" as const, displayName: "Emery" },
    ];
    expect(sortForFollowUp(people).map((person) => person.displayName)).toEqual([
      "Blake",
      "Casey",
      "Emery",
      "Drew",
      "Avery",
    ]);
  });

  it("counts only phones as on", () => {
    expect(alertSummary([{ status: "on" }, { status: "computer_only" }, { status: "off" }])).toBe(
      "1 of 3 has alerts on a phone",
    );
    expect(alertSummary([{ status: "on" }, { status: "on" }])).toBe(
      "2 of 2 have alerts on a phone",
    );
  });

  it("treats anything unknown as not on", () => {
    expect(toAlertStatus("on")).toBe("on");
    expect(toAlertStatus("cannot")).toBe("cannot");
    expect(toAlertStatus("something else")).toBe("off");
  });
});
