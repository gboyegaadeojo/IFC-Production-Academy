import { describe, expect, it } from "vitest";
import {
  blockoutLabel,
  blockoutSchema,
  blocksDate,
  blocksService,
  repeatFallsOn,
  repeatLabel,
  type Blockout,
  blockoutTile,
} from "./blockouts";

const blockout = (change: Partial<Blockout>): Blockout => ({
  startsOn: "2026-11-15",
  endsOn: "2026-11-15",
  startTime: null,
  endTime: null,
  repeat: null,
  note: "",
  ...change,
});

describe("repeating blockouts", () => {
  // Sunday 1 November 2026 is the first Sunday of the month.
  it("falls on the first day's weekday", () => {
    expect(repeatFallsOn("weekly", "2026-11-01", "2026-11-08")).toBe(true);
    expect(repeatFallsOn("weekly", "2026-11-01", "2026-11-09")).toBe(false);
  });

  it("every other week counts from the first day", () => {
    expect(repeatFallsOn("every_other_week", "2026-11-01", "2026-11-15")).toBe(true);
    expect(repeatFallsOn("every_other_week", "2026-11-01", "2026-11-08")).toBe(false);
  });

  it("the nth weekday of the month", () => {
    expect(repeatFallsOn("first", "2026-11-01", "2026-12-06")).toBe(true);
    expect(repeatFallsOn("first", "2026-11-01", "2026-12-13")).toBe(false);
    expect(repeatFallsOn("second", "2026-11-01", "2026-12-13")).toBe(true);
    expect(repeatFallsOn("fourth", "2026-11-01", "2026-11-22")).toBe(true);
  });

  it("the last weekday of the month", () => {
    expect(repeatFallsOn("last", "2026-11-01", "2026-11-29")).toBe(true);
    expect(repeatFallsOn("last", "2026-11-01", "2026-11-22")).toBe(false);
  });

  it("reads plainly", () => {
    expect(repeatLabel("weekly", "2026-11-01")).toBe("Every Sunday");
    expect(repeatLabel("first", "2026-11-01")).toBe("1st Sunday of each month");
    expect(repeatLabel("last", "2026-11-01")).toBe("Last Sunday of each month");
  });
});

describe("what a blockout covers", () => {
  it("covers dates in its range only", () => {
    const range = blockout({ endsOn: "2026-11-22" });
    expect(blocksDate(range, "2026-11-18")).toBe(true);
    expect(blocksDate(range, "2026-11-23")).toBe(false);
  });

  it("a part of a day covers a service only when the times overlap", () => {
    const morning = blockout({ startTime: "08:00", endTime: "11:00" });
    expect(blocksService(morning, "2026-11-15", "10:30", "12:00")).toBe(true);
    expect(blocksService(morning, "2026-11-15", "18:00", "19:30")).toBe(false);
  });

  it("a repeating blockout stops at its last date", () => {
    const monthly = blockout({ startsOn: "2026-11-01", endsOn: "2027-01-31", repeat: "first" });
    expect(blocksDate(monthly, "2027-01-03")).toBe(true);
    expect(blocksDate(monthly, "2027-02-07")).toBe(false);
  });

  it("reads plainly in a list", () => {
    expect(blockoutLabel(blockout({}))).toBe("Sun, Nov 15");
    expect(blockoutLabel(blockout({ endsOn: "2026-11-22" }))).toBe("Sun, Nov 15 to Sun, Nov 22");
    expect(blockoutLabel(blockout({ startTime: "08:00", endTime: "11:00" }))).toBe(
      "Sun, Nov 15, 8:00 a.m. to 11:00 a.m.",
    );
    expect(
      blockoutLabel(blockout({ startsOn: "2026-11-01", endsOn: "2027-03-28", repeat: "weekly" })),
    ).toBe("Every Sunday, from Sun, Nov 1 to Sun, Mar 28");
  });
});

describe("the blockout form", () => {
  it("one day ends the day it starts", () => {
    expect(blockoutSchema.parse({ kind: "day", startsOn: "2026-11-15", note: " Away " })).toEqual(
      blockout({ note: "Away" }),
    );
  });

  it("part of a day needs the end after the start", () => {
    expect(
      blockoutSchema.safeParse({
        kind: "partial",
        startsOn: "2026-11-15",
        startTime: "11:00",
        endTime: "08:00",
        note: "",
      }).success,
    ).toBe(false);
  });

  it("repeating keeps its rule and last date, within a year", () => {
    expect(
      blockoutSchema.parse({
        kind: "repeating",
        startsOn: "2026-11-01",
        endsOn: "2027-03-28",
        repeat: "first",
        note: "",
      }),
    ).toEqual(blockout({ startsOn: "2026-11-01", endsOn: "2027-03-28", repeat: "first" }));
    expect(
      blockoutSchema.safeParse({
        kind: "repeating",
        startsOn: "2026-11-01",
        endsOn: "2028-01-01",
        repeat: "weekly",
        note: "",
      }).success,
    ).toBe(false);
  });
});

describe("blockoutTile", () => {
  it("shows the first day's month and day", () => {
    expect(blockoutTile("2026-11-29")).toEqual({ month: "NOV", day: "29" });
    expect(blockoutTile("2027-01-03")).toEqual({ month: "JAN", day: "3" });
  });
});
