import type { MetadataRoute } from "next";
import { getBranding, iconUrlFor } from "@/lib/data/branding";
import { THEME_COLORS } from "@/lib/domain/appearance";
import { BRAND_THEME_COLOR } from "@/lib/domain/brand-logo";
import { manifestIcons } from "@/lib/domain/branding";

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
    // The opening screen matches the app's light background, its default. The brand purple tints
    // the installed app in the phone's app switcher; inside the app, each page's theme-color meta
    // tag still matches the page (decision 2026-11-10).
    background_color: THEME_COLORS.light,
    theme_color: BRAND_THEME_COLOR,
    lang: "en-CA",
    icons: manifestIcons(iconUrlFor(branding)),
  };
}
