/**
 * One tab on the phone bar, shared by its links and the Serve button (motion A, G 2026-11-13).
 * The current tab sits on the solid purple pill, so its name and icon are white and bold; the
 * weight and the pill mark it too, not colour alone. The colour changes as the pill arrives.
 */
export function tabClasses(current: boolean): string {
  return `relative flex min-h-[3.25rem] w-full flex-col items-center justify-center gap-[3px] text-[0.625rem] transition-colors duration-[var(--duration-base)] delay-[var(--tab-pill-lag)] ${
    current ? "font-bold text-on-accent" : "font-medium text-text-muted"
  }`;
}

/** The tab's icon pops a little as the pill lands under it. */
export function tabIconClasses(current: boolean): string {
  return `flex transition-transform duration-[var(--duration-spring)] ease-[var(--ease-spring)] ${
    current ? "-translate-y-px scale-[1.18]" : ""
  }`;
}
