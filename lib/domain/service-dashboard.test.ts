import { describe, expect, it } from "vitest";
import {
  addTile,
  dashboardErrorMessage,
  DEFAULT_LAYOUT,
  GRID_COLUMNS,
  layoutRows,
  layoutSchema,
  type LayoutItem,
  parseStoredLayout,
  placeTile,
  removeTile,
  settle,
  sizeTile,
  TILE_KEYS,
  TILES,
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
