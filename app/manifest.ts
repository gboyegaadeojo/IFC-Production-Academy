import type { MetadataRoute } from "next";
import { getBranding, iconUrlFor } from "@/lib/data/branding";
import { THEME_COLORS } from "@/lib/domain/appearance";
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
    background_color: THEME_COLORS.light,
    theme_color: THEME_COLORS.light,
    lang: "en-CA",
    icons: manifestIcons(iconUrlFor(branding)),
  };
}
