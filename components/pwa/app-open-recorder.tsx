"use client";

import { useEffect } from "react";
import { recordAppOpenAction } from "@/app/(app)/notifications/actions";
import { appPlatformFrom } from "@/lib/domain/alerts";

const NOTED_ON = "academy-app-noted-on";

/** True when the page is the installed app, opened from a Home Screen, not a browser tab. */
function installed(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/**
 * Notes, once a day at most, that someone is using the installed app, so leaders can see who has
 * it (Admin, Phone alerts and app; G 2026-11-10). Only the kind of device is sent. Renders nothing.
 */
export function AppOpenRecorder() {
  useEffect(() => {
    if (!installed()) {
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    try {
      if (localStorage.getItem(NOTED_ON) === today) {
        return;
      }
      localStorage.setItem(NOTED_ON, today);
    } catch {
      // Without storage it notes on each visit, which is harmless.
    }
    void recordAppOpenAction(appPlatformFrom(navigator.userAgent, navigator.maxTouchPoints));
  }, []);
  return null;
}
