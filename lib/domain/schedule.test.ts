import { describe, expect, it } from "vitest";
import {
  candidateLabel,
  eventDayLabel,
  eventSchema,
  eventTimeLabel,
  toScheduleError,
  unavailabilitySchema,
  utcToWinnipeg,
  winnipegToUtc,
} from "./schedule";

// The offsets themselves come from the runtime's time zone data, which changes when Manitoba's
// rules do, so these tests check behaviour rather than hard-coding UTC−5 or UTC−6.
const offsetHours = (date: string, time: string) => {
  const utc = winnipegToUtc(date, time);
  const [h, m] = time.split(":").map(Number) as [number, number];
  const wall = Date.UTC(
    Number(date.slice(0, 4)),
    Number(date.slice(5, 7)) - 1,
    Number(date.slice(8, 10)),
    h,
    m,
  );
  return utc ? (wall - utc.getTime()) / 3_600_000 : null;
};

describe("winnipegToUtc", () => {
  it("is Winnipeg time: five or six hours behind UTC", () => {
    for (const date of ["2026-01-15", "2026-03-08", "2026-07-05", "2026-11-01", "2026-12-06"]) {
      expect([-5, -6]).toContain(offsetHours(date, "10:00"));
    }
  });

  it("round-trips through utcToWinnipeg all year", () => {
    for (const date of ["2026-01-15", "2026-03-08", "2026-07-05", "2026-11-01", "2026-12-06"]) {
      const utc = winnipegToUtc(date, "09:30");
      expect(utc && utcToWinnipeg(utc.toISOString())).toEqual([date, "09:30"]);
    }
  });

  it("rejects malformed input", () => {
    expect(winnipegToUtc("2026-13-01", "09:00")).toBeNull();
    expect(winnipegToUtc("2026-11-01", "9am")).toBeNull();
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

  it("turns Winnipeg times into UTC instants two and a half hours apart", () => {
    const parsed = eventSchema.parse(base);
    expect(parsed.title).toBe("Sunday service");
    expect(utcToWinnipeg(parsed.startsAt)).toEqual(["2026-12-06", "09:00"]);
    expect(new Date(parsed.endsAt).getTime() - new Date(parsed.startsAt).getTime()).toBe(
      150 * 60_000,
    );
  });

  it("needs the end after the start", () => {
    const result = eventSchema.safeParse({ ...base, endTime: "09:00" });
    expect(result.error?.issues[0]?.message).toBe("The end time needs to be after the start.");
  });
});

describe("eventTimeLabel", () => {
  it("shows the day and times in Winnipeg", () => {
    const start = winnipegToUtc("2026-12-06", "09:00")?.toISOString() ?? "";
    const end = winnipegToUtc("2026-12-06", "11:30")?.toISOString() ?? "";
    const label = eventTimeLabel(start, end);
    expect(label).toContain("Dec 6");
    expect(label).toMatch(/9:00/);
    expect(label).toMatch(/11:30/);
  });
});

describe("eventDayLabel", () => {
  it("shows the Winnipeg day, even just after midnight there", () => {
    const start = winnipegToUtc("2026-12-06", "00:00")?.toISOString() ?? "";
    expect(eventDayLabel(start)).toContain("Dec 6");
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
    ).toBe("Avery (trained)");
    expect(
      candidateLabel({ name: "Blake", approved: false, conflict: true, unavailable: true }),
    ).toBe("Blake (still learning, already serving that day, unavailable that day)");
  });
});

describe("toScheduleError", () => {
  it("maps database errors", () => {
    expect(toScheduleError({ message: "schedule_conflict" })).toBe("schedule_conflict");
    expect(toScheduleError({ code: "42501", message: "x" })).toBe("not_authorized");
    expect(toScheduleError({ code: "XX000", message: "secret" })).toBe("unknown");
  });
});
