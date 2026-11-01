import type { Metadata, Viewport } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import { getAppearance } from "@/lib/data/appearance";
import {
  colorScheme,
  initialTheme,
  SYSTEM_THEME_SCRIPT,
  THEME_COLORS,
} from "@/lib/domain/appearance";
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

// Each device's appearance (checklist app US-08a): Light by default, Dark, or System.
export async function generateViewport(): Promise<Viewport> {
  const appearance = await getAppearance();
  return {
    themeColor: appearance === "system" ? THEME_COLORS.light : THEME_COLORS[appearance],
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
      className={`${inter.variable} ${geistMono.variable} h-full antialiased`}
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
