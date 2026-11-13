/**
 * App name and logo (ADD-DASH-04). Pure rules: valid names, reading an icon's size, and what the
 * installed app is told to show.
 */
import { z } from "zod";

export type Branding = {
  name: string;
  shortName: string;
  iconPath: string | null;
  /** The system colour: a preset's name or #rrggbb (lib/domain/system-colour.ts). */
  colour: string;
  /** Whether the logo's dot follows the system colour. */
  colourLogo: boolean;
};

export const DEFAULT_BRANDING: Branding = {
  name: "IFC Production Academy",
  shortName: "IFC Academy",
  iconPath: null,
  colour: "purple",
  colourLogo: true,
};

export const BRAND_ICON_SIZE = 512;
export const BRAND_ICON_MAX_BYTES = 1024 * 1024;
/** Longer short names may be cut off under a home screen icon. */
export const SHORT_NAME_FITS = 12;

export const brandingSchema = z.object({
  name: z.string().trim().min(1).max(40),
  shortName: z.string().trim().min(1).max(24),
});

/** The icon's choices for a logo made on the page. These are artwork, so they stay fixed colours. */
export const ICON_BACKGROUNDS = [
  "#7c3aed",
  "#000000",
  "#1f5fd1",
  "#0a735a",
  "#b8361f",
  "#ffffff",
] as const;

/**
 * The Signal Line mark's colours on an icon background (decision 2026-11-10): the dot is the only
 * accent. Light: black line, purple dot. Black: light line, lavender dot. Purple or any other
 * colour: one light colour for both, since the dot can't stand out there.
 */
export function markColoursOn(background: string): { line: string; dot: string } {
  const colour = background.toLowerCase();
  if (colour === "#ffffff") {
    return { line: "#000000", dot: "#7c3aed" };
  }
  if (colour === "#000000") {
    return { line: "#f5f5f5", dot: "#b69bff" };
  }
  return { line: "#f5f5f5", dot: "#f5f5f5" };
}

/** Up to three initials for a logo made from the short name. */
export function iconInitials(shortName: string): string {
  const initials = shortName
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0))
    .join("")
    .slice(0, 3)
    .toUpperCase();
  return initials === "" ? "A" : initials;
}

/**
 * The name beside the logo, with its last word soft. The Signal Line mark doesn't spell "IFC", so
 * the whole name shows (decision 2026-11-10).
 */
export function wordmarkParts(name: string): { lead: string; soft: string } {
  const words = name.trim().split(/\s+/);
  if (words.length < 2) {
    return { lead: words[0] ?? "", soft: "" };
  }
  return { lead: words.slice(0, -1).join(" "), soft: words.at(-1) ?? "" };
}

/**
 * Whether the built-in Signal Line logo shows. A logo or a new name chosen in Admin, Branding
 * (ADD-DASH-04) takes its place, since the built-in wordmark spells the default name.
 */
export function usesBuiltInLogo(brand: { name: string; iconUrl: string | null }): boolean {
  return brand.iconUrl === null && brand.name.trim() === DEFAULT_BRANDING.name;
}

export function brandIconUrl(supabaseUrl: string, iconPath: string): string {
  return `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/branding/${iconPath}`;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Whether these bytes are a PNG of exactly this square size, from its header. */
export function isSquarePng(bytes: Uint8Array, size: number): boolean {
  if (bytes.length < 24 || PNG_SIGNATURE.some((value, index) => bytes[index] !== value)) {
    return false;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return view.getUint32(16) === size && view.getUint32(20) === size;
}

/** What the installed app shows: the original icons, or the one uploaded for every size. */
export function manifestIcons(
  iconUrl: string | null,
): { src: string; sizes: string; type: string; purpose: "any" | "maskable" }[] {
  if (iconUrl) {
    return [
      { src: iconUrl, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: iconUrl, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ];
  }
  return [
    { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    // Full-bleed purple with the mark inside the central 80%, so any launcher shape keeps it whole.
    {
      src: "/icons/icon-maskable-192.png",
      sizes: "192x192",
      type: "image/png",
      purpose: "maskable",
    },
    {
      src: "/icons/icon-maskable-512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "maskable",
    },
  ];
}
