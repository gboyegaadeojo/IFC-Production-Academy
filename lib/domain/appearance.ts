// Appearance: light or dark, chosen by each person and remembered on that device. Light is the
// default (new look approved 2026-11-01). The System choice was dropped for a simple toggle
// (G, 2026-11-03), so a device that had it starts light.

export const APPEARANCES = ["dark", "light"] as const;
export type Appearance = (typeof APPEARANCES)[number];

/** The device cookie that remembers the choice. Not sensitive: it only picks colours. */
export const APPEARANCE_COOKIE = "appearance";
export const APPEARANCE_MAX_AGE = 60 * 60 * 24 * 400;

export function parseAppearance(value: string | null | undefined): Appearance {
  return (APPEARANCES as readonly string[]).includes(value ?? "") ? (value as Appearance) : "light";
}

/** The browser chrome colour: --bg in each theme (see app/globals.css). */
export const THEME_COLORS = { dark: "#000000", light: "#f6f5fa" } as const;
