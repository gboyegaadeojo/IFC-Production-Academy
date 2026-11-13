/**
 * The system colour (G, 2026-11-13; ADD-DASH-04): the colour of buttons, links, the current tab
 * and highlights, for everyone, in light and dark. Seven tested colours, or a custom one that is
 * deepened or lightened only as far as it takes for text to stay readable (WCAG 2.2 AA, 4.5 to 1).
 * Department colours and the status colours never change.
 *
 * No packages: the notifications job imports this to colour email buttons.
 */

export type ColourSet = {
  /** Fills with white text on them: buttons, the current tab. */
  accent: string;
  /** The colour as text, links and focus rings, on the page's own background. */
  accentLight: string;
  /** A wash behind the current item. */
  accentSoft: string;
};

export type SystemColour = { light: ColourSet; dark: ColourSet };

export const COLOUR_PRESETS = [
  "purple",
  "blue",
  "teal",
  "green",
  "orange",
  "rose",
  "graphite",
] as const;
export type ColourPreset = (typeof COLOUR_PRESETS)[number];

export const DEFAULT_COLOUR: ColourPreset = "purple";

export const PRESET_NAMES: Record<ColourPreset, string> = {
  purple: "Purple",
  blue: "Blue",
  teal: "Teal",
  green: "Green",
  orange: "Orange",
  rose: "Rose",
  graphite: "Graphite",
};

/** Purple is today's colours exactly; the rest were chosen to match and checked for contrast. */
export const PRESETS: Record<ColourPreset, SystemColour> = {
  purple: {
    light: { accent: "#6d3fe0", accentLight: "#5b2fd0", accentSoft: "#efe9fd" },
    dark: { accent: "#7c3aed", accentLight: "#b69bff", accentSoft: "#241d3d" },
  },
  blue: {
    light: { accent: "#2563eb", accentLight: "#1d4ed8", accentSoft: "#e6eefe" },
    dark: { accent: "#2563eb", accentLight: "#8fb4ff", accentSoft: "#16233f" },
  },
  teal: {
    light: { accent: "#0f766e", accentLight: "#0f766e", accentSoft: "#e0f3f1" },
    dark: { accent: "#0f766e", accentLight: "#5fd4c6", accentSoft: "#0f2a28" },
  },
  green: {
    light: { accent: "#15803d", accentLight: "#166534", accentSoft: "#e5f5ea" },
    dark: { accent: "#15803d", accentLight: "#6fd894", accentSoft: "#12291a" },
  },
  orange: {
    light: { accent: "#c2410c", accentLight: "#c2410c", accentSoft: "#fdeee6" },
    dark: { accent: "#c2410c", accentLight: "#ffa071", accentSoft: "#33190d" },
  },
  rose: {
    light: { accent: "#be185d", accentLight: "#be185d", accentSoft: "#fce7f0" },
    dark: { accent: "#be185d", accentLight: "#ff8fbd", accentSoft: "#331421" },
  },
  graphite: {
    light: { accent: "#3f3f46", accentLight: "#3f3f46", accentSoft: "#ececef" },
    dark: { accent: "#52525b", accentLight: "#d4d4d8", accentSoft: "#222225" },
  },
};

/** The page backgrounds text must read on: the darkest of each theme's surfaces. */
export const LIGHT_SURFACES = ["#ffffff", "#f6f5fa", "#faf9fd", "#f1eff8"] as const;
export const DARK_SURFACES = ["#000000", "#0a0a0a", "#141414", "#222222"] as const;
const WHITE = "#ffffff";
const BLACK = "#000000";
export const READABLE = 4.5;

const HEX = /^#[0-9a-f]{6}$/;

export function isPreset(value: string): value is ColourPreset {
  return (COLOUR_PRESETS as readonly string[]).includes(value);
}

/** A saved value: a preset's name, or a custom colour as #rrggbb. Anything else is purple. */
export function normaliseColour(value: string | null | undefined): string {
  const tidy = (value ?? "").trim().toLowerCase();
  if (isPreset(tidy)) {
    return tidy;
  }
  const hex = tidy.startsWith("#") ? tidy : `#${tidy}`;
  return HEX.test(hex) ? hex : DEFAULT_COLOUR;
}

/** Whether someone typed a colour the app can use: #rgb or #rrggbb, with or without the #. */
export function parseHex(input: string): string | null {
  let text = input.trim().toLowerCase();
  if (!text.startsWith("#")) {
    text = `#${text}`;
  }
  if (/^#[0-9a-f]{3}$/.test(text)) {
    text = `#${text[1]}${text[1]}${text[2]}${text[2]}${text[3]}${text[3]}`;
  }
  return HEX.test(text) ? text : null;
}

type Rgb = [number, number, number];

function channels(hex: string): Rgb {
  const at = (i: number) => Number.parseInt(hex.slice(i, i + 2), 16);
  return [at(1), at(3), at(5)];
}

function toHex([r, g, b]: Rgb): string {
  return `#${[r, g, b]
    .map((v) =>
      Math.round(Math.min(255, Math.max(0, v)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

/** Mixes `amount` (0 to 1) of `other` into `hex`. */
export function mix(hex: string, other: string, amount: number): string {
  const [r1, g1, b1] = channels(hex);
  const [r2, g2, b2] = channels(other);
  const step = (from: number, to: number) => from + (to - from) * amount;
  return toHex([step(r1, r2), step(g1, g2), step(b1, b2)]);
}

function linear(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const [r, g, b] = channels(hex);
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** WCAG contrast ratio between two colours, 1 to 21. */
export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function readableOnAll(colour: string, surfaces: readonly string[]): boolean {
  return surfaces.every((surface) => contrast(colour, surface) >= READABLE);
}

/** Moves toward `towards` in small steps until the test passes. */
function shiftUntil(hex: string, towards: string, passes: (colour: string) => boolean): string {
  for (let step = 0; step <= 50; step += 1) {
    const colour = mix(hex, towards, step / 50);
    if (passes(colour)) {
      return colour;
    }
  }
  return towards;
}

/**
 * The light and dark sets for a custom colour: deepened just enough for white text on buttons and
 * for text on the light pages, and lightened just enough for text on the dark ones.
 */
export function customColour(hex: string): SystemColour {
  const accent = shiftUntil(hex, BLACK, (c) => contrast(c, WHITE) >= READABLE);
  const lightText = shiftUntil(accent, BLACK, (c) => readableOnAll(c, LIGHT_SURFACES));
  const darkText = shiftUntil(hex, WHITE, (c) => readableOnAll(c, DARK_SURFACES));
  return {
    light: { accent, accentLight: lightText, accentSoft: mix(hex, WHITE, 0.88) },
    dark: { accent, accentLight: darkText, accentSoft: mix(accent, BLACK, 0.72) },
  };
}

/** The colours for a saved value. */
export function resolveColour(value: string | null | undefined): SystemColour {
  const saved = normaliseColour(value);
  return isPreset(saved) ? PRESETS[saved] : customColour(saved);
}

/** For a custom colour the app had to change: the shade buttons will use instead. */
export function adjustedShade(hex: string): string | null {
  const accent = customColour(hex).light.accent;
  return accent === hex.toLowerCase() ? null : accent;
}

/** The colour on email buttons, which are always on white. */
export function emailAccent(value: string | null | undefined): string {
  return resolveColour(value).light.accent;
}

/**
 * The style the root layout adds for a colour other than purple. It outranks the stylesheet's
 * own :root and [data-theme="light"] rules, whatever order they load in. With `logo`, the logo's
 * dot follows too; otherwise it keeps the Signal Line purple.
 */
export function colourCss(value: string | null | undefined, logo: boolean): string {
  const saved = normaliseColour(value);
  if (saved === DEFAULT_COLOUR) {
    return "";
  }
  const { light, dark } = resolveColour(saved);
  const vars = (set: ColourSet, logoAccent: string) =>
    `--accent:${set.accent};--accent-light:${set.accentLight};--accent-soft:${set.accentSoft};` +
    (logo ? `--logo-accent:${logoAccent};` : "");
  return (
    `:root:root{${vars(dark, dark.accentLight)}}` +
    `:root[data-theme=light]{${vars(light, light.accent)}}`
  );
}

/**
 * The light and dark pages, for the Admin preview that shows both side by side whatever theme the
 * admin is in. The same values as the stylesheet's own themes.
 */
export const PREVIEW_PAGES = {
  light: {
    bg: "#f6f5fa",
    surface: "#ffffff",
    card: "#faf9fd",
    border: "#e6e3ef",
    borderStrong: "#7f7a96",
    text: "#16141f",
    textSecondary: "#4f4b63",
    textMuted: "#67637b",
    logoInk: "#000000",
    brandDot: "#7c3aed",
  },
  dark: {
    bg: "#000000",
    surface: "#0a0a0a",
    card: "#141414",
    border: "#2a2a2a",
    borderStrong: "#737373",
    text: "#f5f5f5",
    textSecondary: "#b4b4b4",
    textMuted: "#929292",
    logoInk: "#f5f5f5",
    brandDot: "#b69bff",
  },
} as const;

/** The tokens a preview of one theme sets on itself, so ordinary token classes inside it work. */
export function previewVars(
  theme: "light" | "dark",
  colour: SystemColour,
  logo: boolean,
): Record<string, string> {
  const page = PREVIEW_PAGES[theme];
  const set = colour[theme];
  return {
    "--bg": page.bg,
    "--surface": page.surface,
    "--card": page.card,
    "--border": page.border,
    "--border-strong": page.borderStrong,
    "--text": page.text,
    "--text-secondary": page.textSecondary,
    "--text-muted": page.textMuted,
    "--logo-ink": page.logoInk,
    "--logo-accent": logo ? (theme === "light" ? set.accent : set.accentLight) : page.brandDot,
    "--accent": set.accent,
    "--accent-light": set.accentLight,
    "--accent-soft": set.accentSoft,
  };
}
