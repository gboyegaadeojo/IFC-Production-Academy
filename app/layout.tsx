import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { getAppearance } from "@/lib/data/appearance";
import {
  colorScheme,
  initialTheme,
  SYSTEM_THEME_SCRIPT,
  THEME_COLORS,
} from "@/lib/domain/appearance";
import "./globals.css";

// A grotesk with a technical, broadcast-equipment feel (SPEC §7), and its mono for small labels.
const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});
const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "IFC Production Academy",
    template: "%s · IFC Production Academy",
  },
  description: "Training and readiness for the IFC production team.",
  robots: { index: false, follow: false },
  applicationName: "IFC Academy",
  icons: {
    icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  appleWebApp: { capable: true, title: "IFC Academy", statusBarStyle: "black-translucent" },
};

// Each device's appearance (checklist app US-08a): Dark by default, Light, or System.
export async function generateViewport(): Promise<Viewport> {
  const appearance = await getAppearance();
  return {
    themeColor: appearance === "system" ? THEME_COLORS.dark : THEME_COLORS[appearance],
    colorScheme: colorScheme(appearance),
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const appearance = await getAppearance();
  return (
    // The System script may change data-theme before React hydrates.
    <html
      lang="en-CA"
      data-appearance={appearance}
      data-theme={initialTheme(appearance)}
      suppressHydrationWarning
      className={`${plexSans.variable} ${plexMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: SYSTEM_THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col bg-bg font-sans text-body text-text">
        <a
          href="#main"
          className="sr-only rounded-button bg-accent px-4 py-2 text-on-accent focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50"
        >
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
