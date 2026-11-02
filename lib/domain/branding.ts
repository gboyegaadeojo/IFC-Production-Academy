/**
 * App name and logo (ADD-DASH-04). Pure rules: valid names, reading an icon's size, and what the
 * installed app is told to show.
 */
import { z } from "zod";

export type Branding = { name: string; shortName: string; iconPath: string | null };

export const DEFAULT_BRANDING: Branding = {
  name: "IFC Production Academy",
  shortName: "IFC Academy",
  iconPath: null,
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

/** The name beside the logo: without "IFC", which the mark already says, with its last word soft. */
export function wordmarkParts(name: string): { lead: string; soft: string } {
  const words = name
    .replace(/^IFC\s+/i, "")
    .trim()
    .split(/\s+/);
  if (words.length < 2) {
    return { lead: words[0] ?? "", soft: "" };
  }
  return { lead: words.slice(0, -1).join(" "), soft: words.at(-1) ?? "" };
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
    { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ];
}
