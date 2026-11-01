import { describe, expect, it } from "vitest";
import {
  addDays,
  dayLabel,
  gridRange,
  isAway,
  monthGrid,
  monthLabel,
  parseDate,
  parseMonth,
  repeatingDates,
  shiftMonth,
  winnipegDate,
} from "./month-calendar";

describe("calendar", () => {
  it("finds the Winnipeg date of an instant", () => {
    // 03:00 UTC on July 6 is still July 5 in Winnipeg (dates before 2026-11-01, see tz notes).
    expect(winnipegDate("2026-07-06T03:00:00Z")).toBe("2026-07-05");
    expect(winnipegDate("2026-07-06T15:00:00Z")).toBe("2026-07-06");
  });

  it("adds days across months and years", () => {
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
    expect(addDays("2027-03-01", -1)).toBe("2027-02-28");
  });

  it("accepts only real months and days", () => {
    expect(parseMonth("2026-11", "x")).toBe("2026-11");
    expect(parseMonth("2026-13", "x")).toBe("x");
    expect(parseMonth(["2026-11"], "x")).toBe("x");
    expect(parseDate("2026-11-08")).toBe("2026-11-08");
    expect(parseDate("2026-02-30")).toBeNull();
    expect(parseDate("nope")).toBeNull();
  });

  it("moves between months", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2027-01", -1)).toBe("2026-12");
    expect(monthLabel("2026-11")).toBe("November 2026");
    expect(dayLabel("2026-11-08")).toBe("Sunday, November 8");
  });

  it("lays a month out in whole weeks, Sunday first", () => {
    const grid = monthGrid("2026-11");
    // November 1, 2026 is a Sunday; the month needs five weeks.
    expect(grid).toHaveLength(5);
    expect(grid[0]![0]).toBe("2026-11-01");
    expect(grid.at(-1)!.at(-1)).toBe("2026-12-05");
    expect(monthGrid("2026-10")[0]![0]).toBe("2026-09-27");
    expect(gridRange("2026-10")).toEqual({ from: "2026-09-27", to: "2026-10-31" });
  });

  it("repeats dates weekly or every few weeks", () => {
    expect(repeatingDates("2026-11-08", 3)).toEqual(["2026-11-08", "2026-11-15", "2026-11-22"]);
    expect(repeatingDates("2026-11-08", 2, 2)).toEqual(["2026-11-08", "2026-11-22"]);
  });

  it("knows the days someone is away", () => {
    const away = [{ startsOn: "2026-11-10", endsOn: "2026-11-12" }];
    expect(isAway("2026-11-11", away)).toBe(true);
    expect(isAway("2026-11-13", away)).toBe(false);
  });
});
