import { describe, expect, it } from "vitest";
import {
  alertShown,
  alertSummary,
  alertsOffFor,
  appPlatformFrom,
  inTeamFilter,
  sortForFollowUp,
  toAlertStatus,
} from "./alerts";

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

describe("who has the app, and alerts off by kind", () => {
  it("knows the kind of device from the browser", () => {
    expect(appPlatformFrom("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)", 5)).toBe(
      "iphone",
    );
    expect(appPlatformFrom("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 5)).toBe("iphone");
    expect(appPlatformFrom("Mozilla/5.0 (Linux; Android 15; Pixel 9)", 5)).toBe("android");
    expect(appPlatformFrom("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 0)).toBe("computer");
    expect(appPlatformFrom("Mozilla/5.0 (Windows NT 10.0; Win64; x64)", 0)).toBe("computer");
  });

  it("names the groups with any alert switched off", () => {
    const groups = [
      { title: "Serving", kinds: ["assignment_scheduled", "serving_reminder"] },
      { title: "Training", kinds: ["course_assigned"] },
    ];
    expect(alertsOffFor(["course_assigned"], groups)).toEqual(["Training"]);
    expect(alertsOffFor([], groups)).toEqual([]);
  });

  it("shows alerts as some off only when they're on", () => {
    expect(alertShown("on", ["Training"])).toBe("some");
    expect(alertShown("on", [])).toBe("on");
    expect(alertShown("off", ["Training"])).toBe("off");
  });

  it("filters the list", () => {
    const person = { hasApp: false, shown: "computer_only" as const };
    expect(inTeamFilter("no_app", person)).toBe(true);
    expect(inTeamFilter("not_on", person)).toBe(true);
    expect(inTeamFilter("some_off", person)).toBe(false);
    expect(inTeamFilter("all", person)).toBe(true);
  });
});
