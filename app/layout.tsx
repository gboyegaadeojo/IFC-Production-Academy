import type { Metadata, Viewport } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import { ServiceWorkerSetup } from "@/components/pwa/service-worker-setup";
import { BrandProvider } from "@/components/brand-context";
import { VersionWatcher } from "@/components/shell/version-watcher";
import { getBranding, iconUrlFor } from "@/lib/data/branding";
import { colourCss } from "@/lib/domain/system-colour";
import { getAppearance } from "@/lib/data/appearance";
import { THEME_COLORS } from "@/lib/domain/appearance";
import "./globals.css";

// Inter for everything people read, and a mono for small labels (new look, approved 2026-11-01).
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

/** The site's address, if it's set and valid; without it Next.js uses the request's own host. */
function siteUrl(): URL | undefined {
  try {
    return process.env.NEXT_PUBLIC_SITE_URL ? new URL(process.env.NEXT_PUBLIC_SITE_URL) : undefined;
  } catch {
    return undefined;
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const branding = await getBranding();
  const iconUrl = iconUrlFor(branding);
  return {
    // Absolute links for the Open Graph image (app/opengraph-image.png) in shared-link previews.
    metadataBase: siteUrl(),
    title: {
      default: branding.name,
      template: `%s · ${branding.name}`,
    },
    description: "Training and readiness for the IFC production team.",
    robots: { index: false, follow: false },
    applicationName: branding.shortName,
    icons: iconUrl
      ? { icon: [{ url: iconUrl, type: "image/png" }], apple: [{ url: iconUrl }] }
      : {
          // Signal Line (decision 2026-11-10): the ICO for older browsers, then an SVG that follows
          // the browser's light or dark theme, and a full-square icon iOS rounds itself.
          icon: [
            { url: "/favicon.ico", sizes: "16x16 32x32 48x48" },
            { url: "/icon.svg", type: "image/svg+xml" },
          ],
          apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
        },
    appleWebApp: { capable: true, title: branding.shortName, statusBarStyle: "default" },
  };
}

// Each device's appearance: light by default, or dark.
export async function generateViewport(): Promise<Viewport> {
  const appearance = await getAppearance();
  return {
    themeColor: THEME_COLORS[appearance],
    colorScheme: appearance,
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [appearance, branding] = await Promise.all([getAppearance(), getBranding()]);
  const systemColour = colourCss(branding.colour, branding.colourLogo);
  return (
    <html
      lang="en-CA"
      data-theme={appearance}
      className={`${inter.variable} ${geistMono.variable} h-full antialiased`}
    >
      {systemColour ? (
        <head>
          {/* The system colour from Admin (G, 2026-11-13): only colours, checked in
              lib/domain/system-colour.ts, so nothing else can reach the page's styles. */}
          <style id="system-colour">{systemColour}</style>
        </head>
      ) : null}
      <body className="flex min-h-full flex-col overflow-x-clip bg-bg font-sans text-body text-text">
        <a
          href="#main"
          className="sr-only rounded-button bg-accent px-4 py-2 text-on-accent focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50"
        >
          Skip to main content
        </a>
        <BrandProvider
          value={{
            name: branding.name,
            shortName: branding.shortName,
            iconUrl: iconUrlFor(branding),
          }}
        >
          {children}
        </BrandProvider>
        <ServiceWorkerSetup />
        <VersionWatcher />
      </body>
    </html>
  );
}
