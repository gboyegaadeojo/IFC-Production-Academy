import type { MetadataRoute } from "next";

/**
 * Installable web app (SPEC §1 "responsive and an installable PWA", MVP checklist). The icon is a
 * placeholder lens mark in the Academy's colours until IFC's brand assets are decided (SPEC §9).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "IFC Production Academy",
    short_name: "IFC Academy",
    description: "Training and readiness for the IFC production team.",
    id: "/home",
    start_url: "/home",
    scope: "/",
    display: "standalone",
    background_color: "#000000",
    theme_color: "#000000",
    lang: "en-CA",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
