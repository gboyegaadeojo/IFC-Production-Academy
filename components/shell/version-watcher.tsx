"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { isNewVersion, reloadNow } from "@/lib/domain/app-version";

const RUNNING = process.env.NEXT_PUBLIC_APP_VERSION;
const RELOADED_FOR = "academy-reloaded-for";
/** How often an open app checks, besides each time it comes back into view. */
const EVERY_MS = 5 * 60_000;

function reloadedFor(): string | null {
  try {
    return sessionStorage.getItem(RELOADED_FOR);
  } catch {
    return null;
  }
}

function typing(): boolean {
  const active = document.activeElement;
  return (
    active instanceof HTMLInputElement ||
    active instanceof HTMLTextAreaElement ||
    active instanceof HTMLSelectElement ||
    (active instanceof HTMLElement && active.isContentEditable)
  );
}

/**
 * Loads a new version of the app once it's live, on any phone or computer (G, 2026-11-10). It
 * asks which version is live (/api/version) when the app comes back into view and every five
 * minutes. Coming back, it reloads straight away unless someone is typing; otherwise it reloads on
 * the next move to another page. Renders nothing.
 */
export function VersionWatcher() {
  const pathname = usePathname();
  const stale = useRef<string | null>(null);
  const firstPath = useRef(pathname);

  useEffect(() => {
    if (!RUNNING) {
      return;
    }
    const reload = (version: string) => {
      try {
        sessionStorage.setItem(RELOADED_FOR, version);
      } catch {
        // Without storage it can still reload; the version check stops a loop.
      }
      window.location.reload();
    };
    const check = async (justReturned: boolean) => {
      try {
        const response = await fetch("/api/version", { cache: "no-store" });
        const { version } = (await response.json()) as { version?: string };
        if (isNewVersion(RUNNING, version) && version) {
          stale.current = version;
        }
      } catch {
        return; // Offline: try again later.
      }
      if (
        reloadNow({
          stale: stale.current,
          justReturned,
          typing: typing(),
          alreadyReloadedFor: reloadedFor(),
        }) &&
        stale.current
      ) {
        reload(stale.current);
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void check(true);
      }
    };
    void check(false);
    const timer = window.setInterval(() => void check(false), EVERY_MS);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  // Moving to another page with a new version waiting: load the new version of that page.
  useEffect(() => {
    if (pathname === firstPath.current) {
      return;
    }
    firstPath.current = pathname;
    if (stale.current && reloadedFor() !== stale.current) {
      try {
        sessionStorage.setItem(RELOADED_FOR, stale.current);
      } catch {
        // See above.
      }
      window.location.reload();
    }
  }, [pathname]);

  return null;
}
