import { describe, expect, it } from "vitest";
import { formatDate, formatLongDate } from "./dates";

describe("dates", () => {
  it("shows Winnipeg's calendar day, not UTC's", () => {
    // 02:30 UTC on 8 Feb is still the evening of 7 Feb in Winnipeg.
    expect(formatDate("2027-02-08T02:30:00Z")).toBe("Feb 7, 2027");
    expect(formatLongDate("2027-02-08T02:30:00Z")).toBe("February 7, 2027");
  });
});
