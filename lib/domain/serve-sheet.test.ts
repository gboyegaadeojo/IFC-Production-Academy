import { describe, expect, it } from "vitest";
import {
  checklistProgress,
  copyrightLine,
  serviceDay,
  serviceHeading,
  serviceProgressLine,
  sopsLine,
} from "./serve-sheet";

const lists = [
  { isMine: true, done: 2, total: 5 },
  { isMine: false, done: 1, total: 3 },
];

describe("checklistProgress", () => {
  it("counts your own checklists when you're scheduled", () => {
    expect(checklistProgress(lists, true)).toEqual({ done: 2, total: 5 });
  });

  it("counts every checklist when you're not on the team", () => {
    expect(checklistProgress(lists, false)).toEqual({ done: 3, total: 8 });
  });

  it("counts every checklist when none are yours", () => {
    expect(checklistProgress([{ isMine: false, done: 0, total: 4 }], true)).toEqual({
      done: 0,
      total: 4,
    });
  });
});

describe("service lines", () => {
  // Sunday 22 Nov 2026, 10:00 in Winnipeg (UTC-5).
  const service = {
    id: "e1",
    title: "Sunday service",
    startsAt: "2026-11-22T15:00:00Z",
    positions: ["Camera 2"],
    done: 3,
    total: 8,
  };

  it("names the day in Winnipeg time", () => {
    expect(serviceDay("2026-11-23T03:00:00Z")).toBe("Sunday 22 Nov");
  });

  it("puts your position beside the day", () => {
    expect(serviceHeading(service)).toBe("Sunday 22 Nov · Camera 2");
    expect(serviceHeading({ ...service, positions: [] })).toBe("Sunday 22 Nov");
  });

  it("says when it starts and how far along the checklist is", () => {
    expect(serviceProgressLine(service)).toMatch(/^Starts 10:00 a\.m\. · 3 of 8 jobs done$/);
    expect(serviceProgressLine({ ...service, positions: [] })).toContain("3 of 8 checks done");
    expect(serviceProgressLine({ ...service, total: 0 })).toContain("No checklist yet");
  });
});

describe("copyrightLine and sopsLine", () => {
  it("says how many reviews wait and the first one's day", () => {
    expect(copyrightLine({ waiting: 2, firstDay: "2026-11-22" })).toBe(
      "2 waiting · first for Sunday 22 Nov",
    );
    expect(copyrightLine({ waiting: 0, firstDay: null })).toBe("Nothing waiting");
  });

  it("says how many SOPs changed this week", () => {
    expect(sopsLine(2)).toBe("2 updated this week");
    expect(sopsLine(0)).toBe("How we do things");
  });
});
