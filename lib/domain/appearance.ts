// Appearance: Dark, Light or System, chosen by each person and remembered on that device, as in
// IFC's checklist app (its US-08a). Dark is the signature theme and the default.

export const APPEARANCES = ["dark", "light", "system"] as const;
export type Appearance = (typeof APPEARANCES)[number];

export const APPEARANCE_LABELS: Record<Appearance, string> = {
  dark: "Dark",
  light: "Light",
  system: "System",
};

/** The device cookie that remembers the choice. Not sensitive: it only picks colours. */
export const APPEARANCE_COOKIE = "appearance";
export const APPEARANCE_MAX_AGE = 60 * 60 * 24 * 400;

export function parseAppearance(value: string | null | undefined): Appearance {
  return (APPEARANCES as readonly string[]).includes(value ?? "") ? (value as Appearance) : "dark";
}

/**
 * The theme the server can render before the browser runs: System starts dark, and the browser
 * corrects it before the first paint.
 */
export function initialTheme(appearance: Appearance): "dark" | "light" {
  return appearance === "light" ? "light" : "dark";
}

/** The `color-scheme` the browser should use for built-in controls and scrollbars. */
export function colorScheme(appearance: Appearance): "dark" | "light" | "dark light" {
  return appearance === "system" ? "dark light" : appearance;
}

/** The browser chrome colour: --bg in each theme (see app/globals.css). */
export const THEME_COLORS = { dark: "#000000", light: "#f7f8fa" } as const;

/**
 * Runs in <head> before the first paint, so "System" never flashes the wrong theme, and follows
 * the device when it switches between dark and light. Kept small and free of user input.
 */
export const SYSTEM_THEME_SCRIPT = `(function(){var d=document.documentElement;var m=window.matchMedia("(prefers-color-scheme: light)");function s(){if(d.dataset.appearance==="system")d.dataset.theme=m.matches?"light":"dark";}s();m.addEventListener("change",s);})();`;
