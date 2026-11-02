import type { ReactNode } from "react";
import {
  ClockIcon,
  DashboardIcon,
  FileTextIcon,
  InfoIcon,
  LayersIcon,
  ListChecksIcon,
  ListIcon,
  MonitorIcon,
  SettingsIcon,
  UsersIcon,
} from "@/components/ui/icons";
import {
  type LayoutItem,
  type TileGroup,
  type TileKey,
  TILES,
} from "@/lib/domain/service-dashboard";

/** Each tile's icon and its soft colour, by the group it belongs to (decorative only). */
export const TILE_ICONS: Record<TileKey, (props: { className?: string }) => ReactNode> = {
  run: ListIcon,
  current: ClockIcon,
  team: UsersIcon,
  timer: ClockIcon,
  pptimers: ClockIcon,
  slides: MonitorIcon,
  levels: LayersIcon,
  spl: InfoIcon,
  preview: MonitorIcon,
  encoder: SettingsIcon,
  youtube: DashboardIcon,
  facebook: DashboardIcon,
  checklist: ListChecksIcon,
  notes: FileTextIcon,
  sops: FileTextIcon,
};

export const GROUP_TILE_CLASSES: Record<TileGroup, string> = {
  Service: "bg-tile-green text-tile-green-ink",
  Timers: "bg-tile-orange text-tile-orange-ink",
  Slides: "bg-tile-violet text-tile-violet-ink",
  Audio: "bg-tile-pink text-tile-pink-ink",
  "Video and stream": "bg-tile-blue text-tile-blue-ink",
  "Tasks and notes": "bg-tile-grey text-tile-grey-ink",
};

/** A tile's place on the 12-column grid, read by .service-wall in globals.css. */
export function tileStyle(item: LayoutItem) {
  return {
    "--tile-x": item.x,
    "--tile-y": item.y,
    "--tile-w": item.w,
    "--tile-h": item.h,
  } as React.CSSProperties;
}

/** The dashboard's wall of tiles. Each tile's contents come from `content`. */
export function TileWall({
  items,
  content,
}: {
  items: readonly LayoutItem[];
  content: (item: LayoutItem) => ReactNode;
}) {
  return (
    <div className="service-wall">
      {items.map((item) => {
        const tile = TILES[item.tile];
        return (
          <section
            key={item.tile}
            aria-label={tile.name}
            style={tileStyle(item)}
            className="flex min-h-0 min-w-0 flex-col rounded-card border border-border bg-surface"
          >
            <h2 className="px-3 pt-2 eyebrow text-text-muted">{tile.name}</h2>
            <div
              tabIndex={0}
              data-tile-body
              className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-auto px-3 pt-1.5 pb-2.5"
            >
              {content(item)}
            </div>
          </section>
        );
      })}
    </div>
  );
}
