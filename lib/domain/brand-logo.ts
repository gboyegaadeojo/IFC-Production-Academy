/**
 * The Signal Line logo's geometry (decision 2026-11-10, docs/decisions/2026-11-10-signal-line-brand.md).
 * Pure rules: each variant's drawing area, its size on screen, and which cut of the mark to draw.
 * The shapes themselves are in lib/generated/brand-paths.ts and are never redrawn.
 */

export type LogoVariant = "mark" | "horizontal" | "stacked";
/** auto follows the app's theme; light and dark force one; mono draws everything in currentColor. */
export type LogoTone = "auto" | "light" | "dark" | "mono";

type Box = { x: number; y: number; width: number; height: number };

/**
 * Each variant's viewBox. The mark is 96 square. The horizontal logo is the approved artwork's
 * 104px mark with its 22px-plus gap and wordmark, trimmed to the mark's box. The stacked logo
 * centres the same wordmark under the mark.
 */
export const LOGO_VIEWBOX: Record<LogoVariant, Box> = {
  mark: { x: 0, y: 0, width: 96, height: 96 },
  horizontal: { x: 24, y: 24, width: 366, height: 104 },
  stacked: { x: 148, y: 0, width: 246, height: 184 },
};

/** Where the 96-unit mark sits inside each variant, in that variant's units. */
export const MARK_PLACEMENT: Record<LogoVariant, Box> = {
  mark: { x: 0, y: 0, width: 96, height: 96 },
  horizontal: { x: 24, y: 24, width: 104, height: 104 },
  stacked: { x: 219, y: 0, width: 104, height: 104 },
};

/** How far the wordmark's two lines move from their place in the horizontal artwork. */
export const STACKED_OFFSETS = { name: { x: 0, y: 78 }, academy: { x: 64, y: 78 } } as const;

/** The heavier cut is for marks this small or smaller (the 16px favicon). */
export const SMALL_MARK_MAX_PX = 20;

/** The logo's width and height on screen for a height in pixels, keeping its proportions. */
export function logoSize(variant: LogoVariant, height: number): { width: number; height: number } {
  const box = LOGO_VIEWBOX[variant];
  return { width: Math.round((height * box.width) / box.height), height };
}

/** How tall the mark itself is drawn, in pixels, when the whole logo is `height` tall. */
export function markPixels(variant: LogoVariant, height: number): number {
  return (height * MARK_PLACEMENT[variant].height) / LOGO_VIEWBOX[variant].height;
}

/** The line's stroke and the dot's radius: the favicon cut at 16px, the standard one otherwise. */
export function markCut(markPx: number): { strokeWidth: number; dotRadius: number } {
  return markPx <= SMALL_MARK_MAX_PX
    ? { strokeWidth: 11, dotRadius: 8 }
    : { strokeWidth: 10, dotRadius: 7 };
}
