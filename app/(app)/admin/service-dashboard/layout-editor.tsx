"use client";

import { type PointerEvent, useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { fieldClasses } from "@/components/ui/field-classes";
import { GROUP_TILE_CLASSES, TILE_ICONS } from "@/components/service-dashboard/tile-wall";
import {
  addTile,
  type DashboardLayout,
  DEFAULT_LAYOUT,
  GRID_COLUMNS,
  type LayoutItem,
  layoutRows,
  placeTile,
  removeTile,
  settle,
  sizeTile,
  TILE_GROUPS,
  TILE_KEYS,
  type TileKey,
  TILES,
} from "@/lib/domain/service-dashboard";
import { saveLayoutAction } from "./actions";

const ROW_HEIGHT = 46;

type Drag =
  | {
      kind: "move" | "size";
      tile: TileKey;
      startX: number;
      startY: number;
      origin: LayoutItem;
      columnWidth: number;
    }
  | { kind: "add"; tile: TileKey; startX: number; startY: number; moved: boolean };

/**
 * Drag tiles in, move them by their dots, and stretch them from the corner (ADD-DASH-03). A
 * keyboard does the same: arrows move, Shift and arrows resize, Delete removes. Nothing is
 * saved until Save layout.
 */
export function LayoutEditor({ initial, canEdit }: { initial: DashboardLayout; canEdit: boolean }) {
  const [name, setName] = useState(initial.name);
  const [items, setItems] = useState<LayoutItem[]>(initial.items);
  const [message, setMessage] = useState<{ text: string; failed?: boolean } | null>(null);
  const [ghost, setGhost] = useState<{ tile: TileKey; x: number; y: number } | null>(null);
  const [saving, startSaving] = useTransition();
  const canvas = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const lastPointer = useRef("mouse");
  const focusTile = useRef<TileKey | null>(null);

  useEffect(() => {
    if (focusTile.current) {
      canvas.current?.querySelector<HTMLElement>(`[data-tile="${focusTile.current}"]`)?.focus();
      focusTile.current = null;
    }
  });

  function beginTileDrag(event: PointerEvent, kind: "move" | "size", item: LayoutItem) {
    if (!canEdit || !canvas.current) {
      return;
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      kind,
      tile: item.tile,
      startX: event.clientX,
      startY: event.clientY,
      origin: item,
      columnWidth: canvas.current.getBoundingClientRect().width / GRID_COLUMNS,
    };
  }

  function continueTileDrag(event: PointerEvent) {
    const current = drag.current;
    if (!current || current.kind === "add") {
      return;
    }
    const columns = Math.round((event.clientX - current.startX) / current.columnWidth);
    const rows = Math.round((event.clientY - current.startY) / ROW_HEIGHT);
    const { origin } = current;
    const next =
      current.kind === "move"
        ? placeTile(origin, origin.x + columns, origin.y + rows)
        : sizeTile(origin, origin.w + columns, origin.h + rows);
    setItems((all) => all.map((entry) => (entry.tile === origin.tile ? next : entry)));
  }

  function endTileDrag() {
    const current = drag.current;
    drag.current = null;
    if (current && current.kind !== "add") {
      setItems((all) => settle(all, current.tile));
      setMessage(null);
    }
  }

  function beginAdd(event: PointerEvent, tile: TileKey) {
    lastPointer.current = event.pointerType;
    if (!canEdit || event.pointerType !== "mouse") {
      return;
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      kind: "add",
      tile,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    };
  }

  function continueAdd(event: PointerEvent) {
    const current = drag.current;
    if (!current || current.kind !== "add") {
      return;
    }
    const distance =
      Math.abs(event.clientX - current.startX) + Math.abs(event.clientY - current.startY);
    if (current.moved || distance > 5) {
      current.moved = true;
      setGhost({ tile: current.tile, x: event.clientX + 8, y: event.clientY + 8 });
    }
  }

  function endAdd(event: PointerEvent) {
    const current = drag.current;
    drag.current = null;
    setGhost(null);
    if (!current || current.kind !== "add") {
      return;
    }
    if (!current.moved) {
      add(current.tile);
      return;
    }
    const box = canvas.current?.getBoundingClientRect();
    if (
      box &&
      event.clientX >= box.left &&
      event.clientX <= box.right &&
      event.clientY >= box.top &&
      event.clientY <= box.bottom
    ) {
      add(current.tile, {
        x: Math.round((event.clientX - box.left) / (box.width / GRID_COLUMNS)) - 2,
        y: Math.round((event.clientY - box.top) / ROW_HEIGHT),
      });
    }
  }

  function add(tile: TileKey, spot?: { x: number; y: number }) {
    setItems((all) => addTile(all, tile, spot));
    setMessage({ text: `${TILES[tile].name} added.` });
  }

  function remove(tile: TileKey) {
    setItems((all) => removeTile(all, tile));
    setMessage({ text: `${TILES[tile].name} removed.` });
  }

  function onTileKey(event: React.KeyboardEvent, item: LayoutItem) {
    if (!canEdit || event.target !== event.currentTarget) {
      return;
    }
    const across = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
    const down = event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
    if (across !== 0 || down !== 0) {
      event.preventDefault();
      const next = event.shiftKey
        ? sizeTile(item, item.w + across, item.h + down)
        : placeTile(item, item.x + across, item.y + down);
      focusTile.current = item.tile;
      setItems((all) =>
        settle(
          all.map((entry) => (entry.tile === item.tile ? next : entry)),
          item.tile,
        ),
      );
      setMessage({
        text: event.shiftKey
          ? `${TILES[item.tile].name} is now ${next.w} wide and ${next.h} tall.`
          : `${TILES[item.tile].name} moved.`,
      });
    } else if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      remove(item.tile);
    }
  }

  function save() {
    startSaving(async () => {
      const result = await saveLayoutAction({ name, items, channels: initial.channels });
      setMessage({ text: result.message, failed: !result.ok });
    });
  }

  function reset() {
    setItems(DEFAULT_LAYOUT.items);
    setName(DEFAULT_LAYOUT.name);
    setMessage({ text: "Back to the original layout. Save to keep it." });
  }

  const onLayout = new Set(items.map((item) => item.tile));

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-3xl text-small text-text-secondary">
        Drag a tile in, move it by its dots, and stretch it from the corner. On a keyboard, focus a
        tile, then use the arrow keys to move it, Shift and the arrow keys to resize it, and Delete
        to remove it. The wall TV has to fit everything on one screen, so the more tiles you add,
        the smaller the text gets there.
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-64 flex-col gap-1">
          <label htmlFor="layout-name" className="text-small font-medium text-text-secondary">
            Layout name
          </label>
          <input
            id="layout-name"
            value={name}
            maxLength={60}
            disabled={!canEdit}
            onChange={(event) => setName(event.target.value)}
            className={fieldClasses}
          />
        </div>
        {canEdit ? (
          <>
            <Button type="button" variant="secondary" onClick={reset}>
              Reset
            </Button>
            <Button type="button" onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save layout"}
            </Button>
          </>
        ) : null}
      </div>
      <p
        role="status"
        className={`min-h-5 text-small ${message?.failed ? "text-error" : "text-text-secondary"}`}
      >
        {message?.text}
      </p>

      <div className="grid gap-4 lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start">
        <aside aria-label="Tiles" className="flex flex-col gap-3">
          {TILE_GROUPS.map((group) => (
            <div key={group} className="flex flex-col gap-1">
              <h2 className="eyebrow text-text-muted">{group}</h2>
              {TILE_KEYS.filter((key) => TILES[key].group === group).map((key) => {
                const Icon = TILE_ICONS[key];
                const used = onLayout.has(key);
                return (
                  <button
                    key={key}
                    type="button"
                    disabled={used || !canEdit}
                    onPointerDown={(event) => beginAdd(event, key)}
                    onPointerMove={continueAdd}
                    onPointerUp={endAdd}
                    onClick={(event) => {
                      // A mouse is handled on release, so a drag doesn't also add it twice.
                      if (event.detail === 0 || lastPointer.current !== "mouse") {
                        add(key);
                      }
                    }}
                    className="flex items-center gap-2 rounded-button border border-border bg-card px-2 py-1.5 text-left text-small font-medium hover:bg-hover disabled:cursor-default disabled:opacity-50"
                  >
                    <span
                      aria-hidden="true"
                      className={`grid size-6 shrink-0 place-items-center rounded-button ${GROUP_TILE_CLASSES[group]}`}
                    >
                      <Icon className="size-4" />
                    </span>
                    {TILES[key].name}
                    {used ? <span className="sr-only"> (on the layout)</span> : null}
                  </button>
                );
              })}
            </div>
          ))}
        </aside>

        <div className="overflow-x-auto">
          <div
            ref={canvas}
            aria-label="Layout"
            role="group"
            className="service-canvas relative min-w-[42rem] rounded-card border border-dashed border-border-strong bg-card"
            style={{ height: (Math.max(layoutRows(items), 8) + 3) * ROW_HEIGHT }}
          >
            {items.map((item) => {
              const tile = TILES[item.tile];
              const Icon = TILE_ICONS[item.tile];
              return (
                <div
                  key={item.tile}
                  data-tile={item.tile}
                  tabIndex={canEdit ? 0 : undefined}
                  role="group"
                  aria-label={`${tile.name}, ${item.w} wide, ${item.h} tall`}
                  onKeyDown={(event) => onTileKey(event, item)}
                  className="group absolute p-[3px] focus-visible:outline-none"
                  style={{
                    left: `${(item.x / GRID_COLUMNS) * 100}%`,
                    width: `${(item.w / GRID_COLUMNS) * 100}%`,
                    top: item.y * ROW_HEIGHT,
                    height: item.h * ROW_HEIGHT,
                  }}
                >
                  <div className="relative flex h-full flex-col items-center justify-center gap-1 overflow-hidden rounded-button border border-border-strong bg-surface px-1.5 pt-5 pb-1 text-center text-small group-focus-visible:outline-2 group-focus-visible:outline-accent-light">
                    {canEdit ? (
                      <>
                        <span
                          aria-hidden="true"
                          title="Drag to move"
                          data-testid={`move-${item.tile}`}
                          onPointerDown={(event) => beginTileDrag(event, "move", item)}
                          onPointerMove={continueTileDrag}
                          onPointerUp={endTileDrag}
                          className="absolute top-0.5 left-1 cursor-grab touch-none px-1 text-text-muted select-none"
                        >
                          ::::
                        </span>
                        <button
                          type="button"
                          onClick={() => remove(item.tile)}
                          aria-label={`Remove ${tile.name}`}
                          className="absolute top-0.5 right-1 rounded-button px-1 text-small font-medium text-error hover:bg-hover"
                        >
                          Remove
                        </button>
                        <span
                          aria-hidden="true"
                          title="Drag to resize"
                          data-testid={`resize-${item.tile}`}
                          onPointerDown={(event) => beginTileDrag(event, "size", item)}
                          onPointerMove={continueTileDrag}
                          onPointerUp={endTileDrag}
                          className="service-resize absolute right-0 bottom-0 size-[18px] cursor-nwse-resize touch-none"
                        />
                      </>
                    ) : null}
                    <span
                      aria-hidden="true"
                      className={`grid size-6 place-items-center rounded-button ${GROUP_TILE_CLASSES[tile.group]}`}
                    >
                      <Icon className="size-4" />
                    </span>
                    <strong className="font-medium">{tile.name}</strong>
                    <span className="text-small text-text-muted">
                      {item.w} by {item.h}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {ghost ? (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed z-50 rounded-button border border-accent-light bg-accent-soft px-2.5 py-1 text-small font-medium text-accent-light"
          style={{ left: ghost.x, top: ghost.y }}
        >
          {TILES[ghost.tile].name}
        </div>
      ) : null}
    </div>
  );
}
