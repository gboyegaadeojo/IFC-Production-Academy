import { describe, expect, it } from "vitest";
import {
  addTile,
  buildRun,
  clockLabel,
  countdownLabel,
  dashboardErrorMessage,
  differenceLabel,
  DEFAULT_LAYOUT,
  GRID_COLUMNS,
  layoutRows,
  layoutSchema,
  type LayoutItem,
  parseStoredLayout,
  placeTile,
  type PlanItem,
  removeTile,
  reviewTiming,
  runProgress,
  settle,
  sizeTile,
  TILE_KEYS,
  TILES,
  trainedLabel,
  toDashboardError,
} from "./service-dashboard";

function hasOverlap(items: readonly LayoutItem[]): boolean {
  return items.some((a, index) =>
    items
      .slice(index + 1)
      .some((b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h),
  );
}

const run: LayoutItem = { tile: "run", x: 0, y: 0, w: 4, h: 4 };
const notes: LayoutItem = { tile: "notes", x: 0, y: 4, w: 4, h: 4 };
const two = [run, notes];

describe("the tile list", () => {
  it("describes every tile", () => {
    for (const key of TILE_KEYS) {
      expect(TILES[key].name.length).toBeGreaterThan(0);
    }
  });
});

describe("the default layout", () => {
  it("is valid and has no overlaps", () => {
    expect(layoutSchema.safeParse(DEFAULT_LAYOUT).success).toBe(true);
    expect(hasOverlap(DEFAULT_LAYOUT.items)).toBe(false);
  });

  it("leaves room loudness off, since there is no mic yet", () => {
    expect(DEFAULT_LAYOUT.items.some((item) => item.tile === "spl")).toBe(false);
  });
});

describe("layoutSchema", () => {
  const valid = { name: "Sunday", items: two, channels: ["ch01"] };

  it("accepts a good layout", () => {
    expect(layoutSchema.safeParse(valid).success).toBe(true);
  });

  it.each([
    ["an empty name", { ...valid, name: "  " }],
    ["a tile that doesn't exist", { ...valid, items: [{ ...run, tile: "nope" }] }],
    ["a tile past the right edge", { ...valid, items: [{ ...run, x: 10, w: 4 }] }],
    ["a tile too small", { ...valid, items: [{ ...run, w: 1 }] }],
    ["the same tile twice", { ...valid, items: [run, { ...run, y: 4 }] }],
    ["the same channel twice", { ...valid, channels: ["ch01", "ch01"] }],
    ["an odd channel name", { ...valid, channels: ["<b>"] }],
  ])("refuses %s", (_, layout) => {
    expect(layoutSchema.safeParse(layout).success).toBe(false);
  });
});

describe("parseStoredLayout", () => {
  it("uses the default until one is saved", () => {
    expect(parseStoredLayout(null)).toEqual(DEFAULT_LAYOUT);
  });

  it("uses the saved layout", () => {
    const stored = { name: "Sunday", items: two, channels: [] };
    expect(parseStoredLayout(stored).name).toBe("Sunday");
  });

  it("falls back to the default rather than break if a saved one no longer makes sense", () => {
    expect(parseStoredLayout({ name: "Old", items: [{ tile: "gone" }], channels: [] })).toEqual(
      DEFAULT_LAYOUT,
    );
  });
});

describe("settle", () => {
  it("keeps the placed tile where it was put and moves the other down", () => {
    const moved = [{ ...run }, { ...notes, y: 2 }];
    const result = settle(moved, "notes");
    expect(result.find((item) => item.tile === "notes")?.y).toBe(2);
    expect(result.find((item) => item.tile === "run")?.y).toBe(6);
    expect(hasOverlap(result)).toBe(false);
  });

  it("closes gaps left by other tiles", () => {
    const result = settle([{ ...run, y: 5 }, notes]);
    expect(Math.min(...result.map((item) => item.y))).toBe(0);
    expect(hasOverlap(result)).toBe(false);
  });

  it("keeps the order the tiles came in", () => {
    expect(settle(two).map((item) => item.tile)).toEqual(["run", "notes"]);
  });

  it("doesn't change what it's given", () => {
    const before = JSON.stringify(two);
    settle(two, "run");
    expect(JSON.stringify(two)).toBe(before);
  });

  it("untangles the default layout after a big move", () => {
    const moved = DEFAULT_LAYOUT.items.map((item) =>
      item.tile === "levels" ? { ...item, y: 0 } : item,
    );
    expect(hasOverlap(settle(moved, "levels"))).toBe(false);
  });
});

describe("placeTile and sizeTile", () => {
  it("keeps a tile on the grid", () => {
    expect(placeTile(run, 20, -3)).toMatchObject({ x: GRID_COLUMNS - run.w, y: 0 });
    expect(placeTile(run, -2, 3)).toMatchObject({ x: 0, y: 3 });
  });

  it("keeps a tile at a usable size and inside the right edge", () => {
    expect(sizeTile(run, 1, 1)).toMatchObject({ w: 2, h: 2 });
    expect(sizeTile({ ...run, x: 8 }, 8, 4)).toMatchObject({ w: 4 });
  });
});

describe("addTile and removeTile", () => {
  it("adds below everything by default", () => {
    const result = addTile(two, "sops");
    expect(result.find((item) => item.tile === "sops")?.y).toBe(8);
  });

  it("adds at a spot and makes room", () => {
    const result = addTile(two, "sops", { x: 0, y: 0 });
    expect(result.find((item) => item.tile === "sops")).toMatchObject({ x: 0, y: 0 });
    expect(hasOverlap(result)).toBe(false);
  });

  it("won't add the same tile twice", () => {
    expect(addTile(two, "run")).toHaveLength(2);
  });

  it("removes a tile and closes up", () => {
    const result = removeTile(two, "run");
    expect(result).toEqual([{ tile: "notes", x: 0, y: 0, w: 4, h: 4 }]);
  });
});

describe("layoutRows", () => {
  it("counts down to the lowest tile", () => {
    expect(layoutRows(two)).toBe(8);
    expect(layoutRows([])).toBe(0);
  });
});

describe("errors", () => {
  it("maps database errors to plain words", () => {
    expect(toDashboardError({ message: "dashboard_editor_limit" })).toBe("dashboard_editor_limit");
    expect(toDashboardError({ code: "42501", message: "not_authorized" })).toBe("not_authorized");
    expect(toDashboardError({ message: "connection reset" })).toBe("unknown");
    expect(dashboardErrorMessage("dashboard_editor_limit")).toContain("up to 3");
  });
});

const planItem = (
  id: string,
  position: number,
  lengthSeconds: number,
  servicePosition: PlanItem["servicePosition"] = "during",
  itemType = "item",
): PlanItem => ({
  id,
  position,
  itemType,
  title: id,
  lengthSeconds,
  servicePosition,
  notes: [],
});
const START = Date.parse("2026-11-08T16:00:00Z");
const plan = [
  planItem("countdown", 1, 300, "pre"),
  planItem("Worship", 2, 0, "during", "header"),
  planItem("song", 3, 300),
  planItem("message", 4, 1800),
  planItem("slides", 5, 120, "post"),
];

describe("buildRun", () => {
  const run = buildRun(plan, START);
  const entry = (id: string) => run.find((item) => item.id === id);

  it("ends pre-service items as the service starts", () => {
    expect(entry("countdown")?.startsAt).toBe(START - 300_000);
    expect(entry("countdown")?.endsAt).toBe(START);
  });

  it("runs during items one after another from the start", () => {
    expect(entry("song")?.startsAt).toBe(START);
    expect(entry("message")?.startsAt).toBe(START + 300_000);
  });

  it("puts post items after the rest", () => {
    expect(entry("slides")?.startsAt).toBe(START + 2_100_000);
  });

  it("gives headers no time, even if Planning Center has one", () => {
    const withLength = buildRun(
      [planItem("Head", 1, 60, "during", "header"), planItem("a", 2, 60)],
      START,
    );
    expect(withLength[0]?.isHeader).toBe(true);
    expect(withLength[1]?.startsAt).toBe(START);
  });

  it("follows Planning Center's order", () => {
    expect(buildRun([planItem("b", 2, 60), planItem("a", 1, 60)], START).map((i) => i.id)).toEqual([
      "a",
      "b",
    ]);
  });
});

describe("runProgress", () => {
  const run = buildRun(plan, START);

  it("counts down before anything starts", () => {
    const progress = runProgress(run, START - 400_000);
    expect(progress.state).toBe("before");
    expect(progress.current).toBeNull();
    expect(progress.next?.id).toBe("countdown");
    expect(progress.untilStartSeconds).toBe(100);
  });

  it("finds the current and next item, and the time left", () => {
    const progress = runProgress(run, START + 60_000);
    expect(progress.state).toBe("during");
    expect(progress.current?.id).toBe("song");
    expect(progress.next?.id).toBe("message");
    expect(progress.itemLeftSeconds).toBe(240);
    expect(progress.serviceLeftSeconds).toBe(2160);
  });

  it("says when the plan has finished", () => {
    const progress = runProgress(run, START + 9_000_000);
    expect(progress.state).toBe("after");
    expect(progress.current).toBeNull();
    expect(progress.serviceLeftSeconds).toBe(0);
  });

  it("copes with no plan", () => {
    expect(runProgress([], START)).toMatchObject({ state: "before", current: null, next: null });
  });
});

describe("labels", () => {
  it("shows times in Winnipeg", () => {
    expect(clockLabel(Date.parse("2026-11-08T15:55:00Z"))).toMatch(/^\d{1,2}:55 am$/);
  });

  it("formats countdowns", () => {
    expect(countdownLabel(65)).toBe("1:05");
    expect(countdownLabel(3744)).toBe("1:02:24");
    expect(countdownLabel(-5)).toBe("0:00");
  });

  it("shows Trained or Still learning, and nothing for an open spot", () => {
    expect(trainedLabel("approved")).toBe("Trained");
    expect(trainedLabel("learning")).toBe("Still learning");
    expect(trainedLabel("supervised")).toBe("Still learning");
    expect(trainedLabel(null)).toBeNull();
  });
});

describe("reviewTiming", () => {
  const items: PlanItem[] = [
    { ...planItem("Head", 1, 0, "during", "header") },
    { ...planItem("song", 2, 300), actualSeconds: 330 },
    { ...planItem("message", 3, 1800), actualSeconds: 1770 },
    { ...planItem("close", 4, 120), actualSeconds: null },
  ];

  it("leaves out headers and compares what was recorded", () => {
    const review = reviewTiming(items);
    expect(review.rows.map((row) => row.id)).toEqual(["song", "message", "close"]);
    expect(review.rows[0]?.differenceSeconds).toBe(30);
    expect(review.rows[2]?.differenceSeconds).toBeNull();
    expect(review.plannedSeconds).toBe(2220);
    expect(review.overSeconds).toBe(0);
    expect(review.recorded).toBe(2);
  });

  it("doesn't count an unrecorded item as short", () => {
    expect(reviewTiming([{ ...planItem("a", 1, 300), actualSeconds: null }]).overSeconds).toBe(0);
  });
});

describe("differenceLabel", () => {
  it("says it in plain words", () => {
    expect(differenceLabel(90)).toBe("+1:30 over");
    expect(differenceLabel(-30)).toBe("0:30 under");
    expect(differenceLabel(0)).toBe("On time");
  });
});

describe("a layout saved with the retired Facebook tile", () => {
  const items = [
    { tile: "facebook", x: 0, y: 0, w: 8, h: 3 },
    { tile: "run", x: 0, y: 3, w: 8, h: 6 },
    { tile: "notes", x: 8, y: 0, w: 4, h: 3 },
  ];

  it("keeps the rest of the layout and closes the gap", () => {
    const layout = parseStoredLayout({ name: "Ours", items, channels: ["ch-1"] });
    expect(layout.name).toBe("Ours");
    expect(layout.channels).toEqual(["ch-1"]);
    expect(layout.items.map((entry) => entry.tile)).toEqual(["run", "notes"]);
    expect(layout.items.find((entry) => entry.tile === "run")?.y).toBe(0);
  });

  it("still falls back to the default when a layout makes no sense", () => {
    expect(parseStoredLayout({ name: "Ours", items: [{ tile: "odd" }], channels: [] })).toBe(
      DEFAULT_LAYOUT,
    );
  });
});
