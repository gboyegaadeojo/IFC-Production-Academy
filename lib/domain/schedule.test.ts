import { describe, expect, it } from "vitest";
import {
  candidateLabel,
  eventSchema,
  eventTimeLabel,
  toScheduleError,
  unavailabilitySchema,
  utcToWinnipeg,
  winnipegToUtc,
} from "./schedule";

describe("winnipegToUtc", () => {
  it("uses daylight time in summer and standard time in winter", () => {
    expect(winnipegToUtc("2026-07-05", "09:00")?.toISOString()).toBe("2026-07-05T14:00:00.000Z");
    expect(winnipegToUtc("2026-12-06", "09:00")?.toISOString()).toBe("2026-12-06T15:00:00.000Z");
  });

  it("handles the days the clocks change", () => {
    // 2026: daylight time starts Mar 8 and ends Nov 1 in Winnipeg.
    expect(winnipegToUtc("2026-03-08", "10:00")?.toISOString()).toBe("2026-03-08T15:00:00.000Z");
    expect(winnipegToUtc("2026-11-01", "10:00")?.toISOString()).toBe("2026-11-01T16:00:00.000Z");
  });

  it("rejects malformed input", () => {
    expect(winnipegToUtc("2026-13-01", "09:00")).toBeNull();
    expect(winnipegToUtc("2026-11-01", "9am")).toBeNull();
  });

  it("round-trips through utcToWinnipeg", () => {
    expect(utcToWinnipeg("2026-12-06T15:00:00.000Z")).toEqual(["2026-12-06", "09:00"]);
  });
});

describe("eventSchema", () => {
  const base = {
    title: "  Sunday   service ",
    date: "2026-12-06",
    startTime: "09:00",
    endTime: "11:30",
    location: "",
    notes: "",
  };

  it("turns Winnipeg times into UTC", () => {
    expect(eventSchema.parse(base)).toEqual({
      title: "Sunday service",
      startsAt: "2026-12-06T15:00:00.000Z",
      endsAt: "2026-12-06T17:30:00.000Z",
      location: "",
      notes: "",
    });
  });

  it("needs the end after the start", () => {
    const result = eventSchema.safeParse({ ...base, endTime: "09:00" });
    expect(result.error?.issues[0]?.message).toBe("The end time needs to be after the start.");
  });
});

describe("eventTimeLabel", () => {
  it("shows the day and times in Winnipeg", () => {
    const label = eventTimeLabel("2026-12-06T15:00:00.000Z", "2026-12-06T17:30:00.000Z");
    expect(label).toContain("Dec 6");
    expect(label).toMatch(/9:00/);
    expect(label).toMatch(/11:30/);
  });
});

describe("unavailabilitySchema", () => {
  it("keeps the dates in order", () => {
    expect(
      unavailabilitySchema.safeParse({ startsOn: "2026-12-10", endsOn: "2026-12-09", note: "" })
        .success,
    ).toBe(false);
    expect(
      unavailabilitySchema.safeParse({ startsOn: "2026-12-10", endsOn: "2026-12-10", note: "" })
        .success,
    ).toBe(true);
  });
});

describe("candidateLabel", () => {
  it("says what the checks would find", () => {
    expect(
      candidateLabel({ name: "Avery", approved: true, conflict: false, unavailable: false }),
    ).toBe("Avery (approved)");
    expect(
      candidateLabel({ name: "Blake", approved: false, conflict: true, unavailable: true }),
    ).toBe("Blake (not approved for this role, already serving then, unavailable that day)");
  });
});

describe("toScheduleError", () => {
  it("maps database errors", () => {
    expect(toScheduleError({ message: "not_approved_for_role" })).toBe("not_approved_for_role");
    expect(toScheduleError({ code: "42501", message: "x" })).toBe("not_authorized");
    expect(toScheduleError({ code: "XX000", message: "secret" })).toBe("unknown");
  });
});
