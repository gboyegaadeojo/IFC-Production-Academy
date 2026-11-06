export type RailPosition = {
  /** Scrolled all the way back. */
  start: boolean;
  /** Scrolled all the way forward, so nothing is hidden past the far edge. */
  end: boolean;
  /** The screenful you're on, from 0, for the dots. */
  page: number;
  /** How many screenfuls the row holds; 1 means it all fits. */
  pages: number;
};

/** Where a sideways row is scrolled to, from its measurements in pixels. */
export function railPosition(
  scrollLeft: number,
  scrollWidth: number,
  clientWidth: number,
): RailPosition {
  const max = scrollWidth - clientWidth;
  // A pixel of slack: browsers round scroll positions.
  if (max <= 1 || clientWidth <= 0) {
    return { start: true, end: true, page: 0, pages: 1 };
  }
  const pages = Math.ceil(scrollWidth / clientWidth);
  const left = Math.min(Math.max(scrollLeft, 0), max);
  return {
    start: left <= 1,
    end: left >= max - 1,
    page: Math.round((left / max) * (pages - 1)),
    pages,
  };
}
