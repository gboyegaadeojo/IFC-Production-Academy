/**
 * Service Dashboard (ADD-DASH-01 to 03, docs/decisions/2026-11-02-service-dashboard.md). Pure rules:
 * which tiles exist, what makes a valid layout, and how tiles move on the 12-column grid.
 */
import { z } from "zod";
import { utcToWinnipeg } from "./schedule";

export const TILE_KEYS = [
  "preview",
  "current",
  "run",
  "slides",
  "timer",
  "pptimers",
  "encoder",
  "team",
  "checklist",
  "notes",
  "levels",
  "sops",
  "spl",
] as const;
export type TileKey = (typeof TILE_KEYS)[number];

export const TILE_GROUPS = [
  "Service",
  "Timers",
  "Slides",
  "Audio",
  "Video and stream",
  "Tasks and notes",
] as const;
export type TileGroup = (typeof TILE_GROUPS)[number];

export const TILES: Record<TileKey, { name: string; group: TileGroup; source: string }> = {
  run: { name: "Run of service", group: "Service", source: "Planning Center" },
  current: { name: "Current item", group: "Service", source: "The plan and ProPresenter" },
  team: { name: "Who's serving", group: "Service", source: "Planning Center" },
  timer: { name: "Service timer", group: "Timers", source: "Worked out from the plan" },
  pptimers: { name: "ProPresenter timers", group: "Timers", source: "ProPresenter" },
  slides: { name: "Slides", group: "Slides", source: "ProPresenter" },
  levels: { name: "Mixer levels", group: "Audio", source: "The mixer" },
  spl: { name: "Room loudness (SPL)", group: "Audio", source: "A measurement mic" },
  preview: { name: "Stream preview", group: "Video and stream", source: "YouTube" },
  encoder: { name: "Encoder health", group: "Video and stream", source: "Magewell Ultra Encode" },
  checklist: { name: "Checklist", group: "Tasks and notes", source: "The Academy Checklist" },
  notes: { name: "Producer notes", group: "Tasks and notes", source: "The team" },
  sops: { name: "SOP shortcuts", group: "Tasks and notes", source: "The SOP library" },
};

export const GRID_COLUMNS = 12;
export const MIN_TILE_WIDTH = 2;
export const MIN_TILE_HEIGHT = 2;
const MAX_TILE_HEIGHT = 40;
const MAX_TILE_TOP = 400;

export const MAX_EDITORS = 3;

export type LayoutItem = { tile: TileKey; x: number; y: number; w: number; h: number };
export type DashboardLayout = { name: string; items: LayoutItem[]; channels: string[] };

const itemSchema = z
  .object({
    tile: z.enum(TILE_KEYS),
    x: z
      .number()
      .int()
      .min(0)
      .max(GRID_COLUMNS - 1),
    y: z.number().int().min(0).max(MAX_TILE_TOP),
    w: z.number().int().min(MIN_TILE_WIDTH).max(GRID_COLUMNS),
    h: z.number().int().min(MIN_TILE_HEIGHT).max(MAX_TILE_HEIGHT),
  })
  .refine((item) => item.x + item.w <= GRID_COLUMNS);

export const layoutSchema = z.object({
  name: z.string().trim().min(1).max(60),
  items: z
    .array(itemSchema)
    .max(TILE_KEYS.length)
    .refine((items) => new Set(items.map((item) => item.tile)).size === items.length),
  channels: z
    .array(z.string().regex(/^[a-z0-9-]{1,12}$/))
    .max(100)
    .refine((channels) => new Set(channels).size === channels.length),
});

const item = (tile: TileKey, x: number, y: number, w: number, h: number): LayoutItem => ({
  tile,
  x,
  y,
  w,
  h,
});

/** What everyone sees until an editor saves a layout (the approved mock). */
export const DEFAULT_LAYOUT: DashboardLayout = {
  name: "Production dashboard",
  items: [
    item("preview", 0, 0, 3, 5),
    item("team", 0, 5, 3, 8),
    item("pptimers", 0, 13, 3, 3),
    item("current", 3, 0, 4, 3),
    item("run", 3, 3, 4, 13),
    item("slides", 7, 0, 5, 7),
    item("timer", 7, 7, 2, 3),
    item("encoder", 9, 7, 3, 3),
    item("checklist", 7, 10, 3, 6),
    item("notes", 10, 10, 2, 6),
    item("levels", 0, 16, 12, 5),
  ],
  channels: [],
};

/** Tiles that no longer exist. A layout saved with one keeps the rest of its tiles. */
const RETIRED_TILES = new Set(["youtube", "facebook"]);

/** A stored layout, or the default if nothing is saved or it no longer makes sense. */
export function parseStoredLayout(
  stored: { name: string; items: unknown; channels: unknown } | null,
): DashboardLayout {
  if (!stored) {
    return DEFAULT_LAYOUT;
  }
  const items = Array.isArray(stored.items) ? stored.items : [];
  const current = items.filter(
    (entry: unknown) => !RETIRED_TILES.has(String((entry as { tile?: unknown } | null)?.tile)),
  );
  const parsed = layoutSchema.safeParse({ ...stored, items: current });
  if (!parsed.success) {
    return DEFAULT_LAYOUT;
  }
  // The space a retired tile leaves is closed up.
  return current.length < items.length
    ? { ...parsed.data, items: settle(parsed.data.items) }
    : parsed.data;
}

function overlaps(a: LayoutItem, b: LayoutItem): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/**
 * Makes room after a change: the tile just placed stays where it was put, anything it landed on
 * moves down, and the rest close up any gaps. Never leaves two tiles overlapping.
 */
export function settle(items: readonly LayoutItem[], placedTile?: TileKey): LayoutItem[] {
  const placed = items.find((entry) => entry.tile === placedTile);
  const others = items
    .filter((entry) => entry !== placed)
    .map((entry) => ({ ...entry }))
    .sort((a, b) => a.y - b.y || a.x - b.x);
  const settled: LayoutItem[] = placed ? [{ ...placed }] : [];
  for (const entry of others) {
    let moved = true;
    while (moved) {
      moved = false;
      for (const other of settled) {
        if (overlaps(entry, other)) {
          entry.y = other.y + other.h;
          moved = true;
        }
      }
    }
    settled.push(entry);
  }
  for (const entry of others) {
    while (entry.y > 0) {
      const above = { ...entry, y: entry.y - 1 };
      if (settled.some((other) => other !== entry && overlaps(above, other))) {
        break;
      }
      entry.y -= 1;
    }
  }
  return items.map((entry) => settled.find((other) => other.tile === entry.tile)!);
}

/** Where a tile may go: on the grid and inside its width. */
export function placeTile(entry: LayoutItem, x: number, y: number): LayoutItem {
  return {
    ...entry,
    x: Math.max(0, Math.min(GRID_COLUMNS - entry.w, x)),
    y: Math.max(0, Math.min(MAX_TILE_TOP, y)),
  };
}

/** How big a tile may be: at least the minimum, and never past the right edge. */
export function sizeTile(entry: LayoutItem, w: number, h: number): LayoutItem {
  return {
    ...entry,
    w: Math.max(MIN_TILE_WIDTH, Math.min(GRID_COLUMNS - entry.x, w)),
    h: Math.max(MIN_TILE_HEIGHT, Math.min(MAX_TILE_HEIGHT, h)),
  };
}

/** Adds a tile, at a spot if one is given, otherwise below everything else. */
export function addTile(
  items: readonly LayoutItem[],
  tile: TileKey,
  spot?: { x: number; y: number },
): LayoutItem[] {
  if (items.some((entry) => entry.tile === tile)) {
    return [...items];
  }
  const bottom = items.reduce((lowest, entry) => Math.max(lowest, entry.y + entry.h), 0);
  const added = placeTile({ tile, x: 0, y: 0, w: 4, h: 4 }, spot?.x ?? 0, spot?.y ?? bottom);
  return settle([...items, added], tile);
}

export function removeTile(items: readonly LayoutItem[], tile: TileKey): LayoutItem[] {
  return settle(items.filter((entry) => entry.tile !== tile));
}

/** How many rows the layout uses, so a screen can size itself. */
export function layoutRows(items: readonly LayoutItem[]): number {
  return items.reduce((lowest, entry) => Math.max(lowest, entry.y + entry.h), 0);
}

export type DashboardError = "not_authorized" | "dashboard_editor_limit" | "unknown";

export function toDashboardError(error: { code?: string; message?: string }): DashboardError {
  if (error.message === "dashboard_editor_limit") {
    return "dashboard_editor_limit";
  }
  return error.code === "42501" ? "not_authorized" : "unknown";
}

export function dashboardErrorMessage(error: DashboardError): string {
  switch (error) {
    case "not_authorized":
      return "Your role doesn't include this. Ask the Production Director or a Platform Admin.";
    case "dashboard_editor_limit":
      return `There can be up to ${MAX_EDITORS} editors. Remove someone first.`;
    case "unknown":
      return "That didn't save. Check your connection and try again.";
  }
}

// ---------------------------------------------------------------------------
// The run of service (ADD-DASH-05)
// ---------------------------------------------------------------------------

export type PlanItem = {
  id: string;
  position: number;
  /** "header" marks a section. Planning Center's others are "song", "media", and "item". */
  itemType: string;
  title: string;
  lengthSeconds: number;
  servicePosition: "pre" | "during" | "post";
  notes: { category: string; content: string }[];
  /** From Services LIVE, when someone ran the plan with it. */
  actualSeconds?: number | null;
};

export type RunEntry = {
  id: string;
  title: string;
  isHeader: boolean;
  lengthSeconds: number;
  startsAt: number;
  endsAt: number;
  notes: { category: string; content: string }[];
};

/**
 * Gives each item its planned time. "During" items run from the service's start, "pre" items end
 * as it starts, and "post" items follow. Section headers take no time.
 */
export function buildRun(items: readonly PlanItem[], serviceStart: number): RunEntry[] {
  const ordered = items.toSorted((a, b) => a.position - b.position);
  const seconds = (position: PlanItem["servicePosition"]) =>
    ordered
      .filter((item) => item.servicePosition === position && item.itemType !== "header")
      .reduce((sum, item) => sum + item.lengthSeconds, 0);
  const preStart = serviceStart - seconds("pre") * 1000;
  let during = serviceStart;
  let pre = preStart;
  let post = serviceStart + seconds("during") * 1000;
  return ordered.map((item) => {
    const length = item.itemType === "header" ? 0 : item.lengthSeconds;
    const startsAt =
      item.servicePosition === "pre" ? pre : item.servicePosition === "post" ? post : during;
    const endsAt = startsAt + length * 1000;
    if (item.servicePosition === "pre") {
      pre = endsAt;
    } else if (item.servicePosition === "post") {
      post = endsAt;
    } else {
      during = endsAt;
    }
    return {
      id: item.id,
      title: item.title,
      isHeader: item.itemType === "header",
      lengthSeconds: length,
      startsAt,
      endsAt,
      notes: item.notes,
    };
  });
}

export type RunProgress = {
  state: "before" | "during" | "after";
  now: number;
  current: RunEntry | null;
  next: RunEntry | null;
  itemLeftSeconds: number;
  untilStartSeconds: number;
  serviceLeftSeconds: number;
  endsAt: number;
};

/** Where the service should be right now, going by the plan's times. */
export function runProgress(run: readonly RunEntry[], now: number): RunProgress {
  const timed = run.filter((entry) => !entry.isHeader && entry.lengthSeconds > 0);
  const startsAt = timed.reduce((first, entry) => Math.min(first, entry.startsAt), Infinity);
  const endsAt = timed.reduce((last, entry) => Math.max(last, entry.endsAt), 0);
  const ordered = timed.toSorted((a, b) => a.startsAt - b.startsAt);
  const current = ordered.find((entry) => entry.startsAt <= now && now < entry.endsAt) ?? null;
  const next = ordered.find((entry) => entry.startsAt > now) ?? null;
  const toSeconds = (ms: number) => Math.max(0, Math.ceil(ms / 1000));
  return {
    state: timed.length === 0 || now < startsAt ? "before" : now >= endsAt ? "after" : "during",
    now,
    current,
    next,
    itemLeftSeconds: current ? toSeconds(current.endsAt - now) : 0,
    untilStartSeconds: timed.length === 0 ? 0 : toSeconds(startsAt - now),
    serviceLeftSeconds: toSeconds(endsAt - now),
    endsAt,
  };
}

/** "9:55 am" in Winnipeg time. */
export function clockLabel(ms: number): string {
  const [, time] = utcToWinnipeg(new Date(ms).toISOString());
  const [hour = 0, minute = 0] = time.split(":").map(Number);
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}:${String(minute).padStart(2, "0")} ${hour < 12 ? "am" : "pm"}`;
}

/** "4:05", or "1:02:24" past an hour. */
export function countdownLabel(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const rest = String(whole % 60).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}` : `${minutes}:${rest}`;
}

/** Someone's position on the Who's serving tile, shown and never a gate. */
export type TeamRow = {
  positionId: string;
  roleName: string;
  name: string | null;
  label: "Trained" | "Still learning" | null;
};

export function trainedLabel(readiness: string | null): TeamRow["label"] {
  if (readiness === null) {
    return null;
  }
  return readiness === "approved" ? "Trained" : "Still learning";
}

// ---------------------------------------------------------------------------
// After the service (ADD-DASH-10)
// ---------------------------------------------------------------------------

export type ReviewRow = {
  id: string;
  title: string;
  plannedSeconds: number;
  actualSeconds: number | null;
  differenceSeconds: number | null;
};

/**
 * Planned against actual, for items with a time. "Against the plan" only counts items with a
 * recorded time, so a half-recorded service doesn't look short.
 */
export function reviewTiming(items: readonly PlanItem[]): {
  rows: ReviewRow[];
  plannedSeconds: number;
  overSeconds: number;
  recorded: number;
} {
  const rows = items
    .filter((item) => item.itemType !== "header")
    .toSorted((a, b) => a.position - b.position)
    .map((item) => {
      const actual = item.actualSeconds ?? null;
      return {
        id: item.id,
        title: item.title,
        plannedSeconds: item.lengthSeconds,
        actualSeconds: actual,
        differenceSeconds: actual === null ? null : actual - item.lengthSeconds,
      };
    });
  return {
    rows,
    plannedSeconds: rows.reduce((sum, row) => sum + row.plannedSeconds, 0),
    overSeconds: rows.reduce((sum, row) => sum + (row.differenceSeconds ?? 0), 0),
    recorded: rows.filter((row) => row.actualSeconds !== null).length,
  };
}

/** "+1:30 over", "0:30 under", or "On time". */
export function differenceLabel(seconds: number): string {
  if (seconds === 0) {
    return "On time";
  }
  return seconds > 0 ? `+${countdownLabel(seconds)} over` : `${countdownLabel(-seconds)} under`;
}
