import { describe, expect, it } from "vitest";
import {
  clockAfter,
  eventTimesSchema,
  formatLength,
  itemsFromTemplate,
  parseLength,
  planItemsSchema,
  planPayload,
  planTimeline,
  timesPayload,
  type PlanItem,
} from "./plan";
import { winnipegToUtc } from "./schedule";

const item = (kind: PlanItem["kind"], title: string, lengthSeconds: number): PlanItem => ({
  id: null,
  kind,
  title,
  lengthSeconds,
  notes: [],
});

describe("lengths", () => {
  it("reads minutes and seconds, or minutes alone", () => {
    expect(parseLength("4:30")).toBe(270);
    expect(parseLength("5")).toBe(300);
    expect(parseLength("0:45")).toBe(45);
    expect(parseLength("")).toBe(0);
  });

  it("refuses anything else, and items over four hours", () => {
    expect(parseLength("4:75")).toBeNull();
    expect(parseLength("four")).toBeNull();
    expect(parseLength("241")).toBeNull();
  });

  it("writes minutes and seconds", () => {
    expect(formatLength(270)).toBe("4:30");
    expect(formatLength(2100)).toBe("35:00");
    expect(formatLength(5)).toBe("0:05");
  });
});

describe("the order of service", () => {
  const items = [
    item("header", "Worship", 0),
    item("song", "Opening song", 270),
    item("item", "Welcome", 240),
    item("header", "Message", 0),
    item("item", "Sermon", 2100),
  ];

  it("starts each item after the ones before it; headers take no time", () => {
    expect(planTimeline(items)).toEqual({ starts: [0, 0, 270, 510, 510], totalSeconds: 2610 });
  });

  it("names the clock time the service reaches", () => {
    const startsAt = winnipegToUtc("2026-11-15", "10:30")!.toISOString();
    expect(clockAfter(startsAt, 2610)).toBe("11:13 a.m.");
  });

  it("sends headers with no length, and trims what was typed", () => {
    expect(
      planPayload([
        { ...item("header", " Worship ", 0), lengthSeconds: 99 },
        { ...item("item", "Sermon", 60), notes: [{ category: " Sound ", content: " Lapel 2 " }] },
      ]),
    ).toEqual([
      { id: null, kind: "header", title: "Worship", length_seconds: 0, notes: [] },
      {
        id: null,
        kind: "item",
        title: "Sermon",
        length_seconds: 60,
        notes: [{ category: "Sound", content: "Lapel 2" }],
      },
    ]);
  });

  it("needs a title on every item and a heading on every note", () => {
    expect(planItemsSchema.safeParse([item("item", " ", 0)]).success).toBe(false);
    expect(
      planItemsSchema.safeParse([
        { ...item("item", "Sermon", 0), notes: [{ category: "", content: "Lapel 2" }] },
      ]).success,
    ).toBe(false);
    expect(planItemsSchema.safeParse(items).success).toBe(true);
  });

  it("reads a template's stored items as new items, leaving out anything unreadable", () => {
    expect(
      itemsFromTemplate([
        { kind: "song", title: "Opening song", length_seconds: 270, notes: [] },
        { title: 5 },
        { kind: "mystery", title: "Welcome", length_seconds: 240 },
      ]),
    ).toEqual([
      { id: null, kind: "song", title: "Opening song", lengthSeconds: 270, notes: [] },
      { id: null, kind: "item", title: "Welcome", lengthSeconds: 240, notes: [] },
    ]);
    expect(itemsFromTemplate(null)).toEqual([]);
  });
});

describe("extra times", () => {
  it("puts them on the service's Winnipeg day", () => {
    const startsAt = winnipegToUtc("2026-11-15", "10:30")!.toISOString();
    expect(
      timesPayload(startsAt, [{ kind: "rehearsal", label: "", start: "08:30", end: "09:30" }]),
    ).toEqual([
      {
        kind: "rehearsal",
        label: "",
        starts_at: winnipegToUtc("2026-11-15", "08:30")!.toISOString(),
        ends_at: winnipegToUtc("2026-11-15", "09:30")!.toISOString(),
      },
    ]);
  });

  it("needs each time to end after it starts", () => {
    expect(
      eventTimesSchema.safeParse([{ kind: "other", label: "", start: "09:30", end: "09:00" }])
        .success,
    ).toBe(false);
  });
});
