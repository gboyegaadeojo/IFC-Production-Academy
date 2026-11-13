import type { MetadataRoute } from "next";
import { getBranding, iconUrlFor } from "@/lib/data/branding";
import { THEME_COLORS } from "@/lib/domain/appearance";
import { manifestIcons } from "@/lib/domain/branding";
import { resolveColour } from "@/lib/domain/system-colour";

export const dynamic = "force-dynamic";

/**
 * Installable web app (SPEC §1 "responsive and an installable PWA", MVP checklist). The name and
 * icon come from Admin, App name and logo (ADD-DASH-04).
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const branding = await getBranding();
  return {
    name: branding.name,
    short_name: branding.shortName,
    description: "Training and readiness for the IFC production team.",
    id: "/home",
    start_url: "/home",
    scope: "/",
    display: "standalone",
    // The opening screen matches the app's light background, its default. The system colour
    // (purple unless Admin changed it, G 2026-11-13) tints the installed app in the phone's app
    // switcher; inside the app, each page's theme-color meta tag still matches the page.
    background_color: THEME_COLORS.light,
    theme_color: resolveColour(branding.colour).dark.accent,
    lang: "en-CA",
    icons: manifestIcons(iconUrlFor(branding)),
  };
}
