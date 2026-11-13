"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { appBadgeAction } from "@/app/(app)/notifications/actions";
import { onMessagesChanged } from "@/lib/data/messages-live";
import { applyAppBadge } from "@/lib/domain/app-badge";

/**
 * Keeps the number on the app's icon right while the app is open (badge A, G 2026-11-10): every
 * unread notification and message together. Alerts set it while the app is closed (public/sw.js).
 * It checks as soon as a message arrives (MessagesLive), on each page change, when the app comes
 * back into view, and once a minute. Renders nothing; devices that can't show a number skip it.
 */
export function AppIconBadge() {
  const pathname = usePathname();

  useEffect(() => {
    if (!("setAppBadge" in navigator)) {
      return;
    }
    let cancelled = false;
    const check = () => {
      if (document.visibilityState === "visible") {
        void appBadgeAction().then((count) => {
          if (!cancelled) {
            void applyAppBadge(count, navigator);
          }
        });
      }
    };
    check();
    const timer = window.setInterval(check, 60_000);
    document.addEventListener("visibilitychange", check);
    const stopLive = onMessagesChanged(check);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
      stopLive();
    };
  }, [pathname]);

  return null;
}
