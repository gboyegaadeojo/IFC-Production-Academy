"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { scrubPath, scrubUsageEvent } from "@/lib/domain/monitoring";

const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const host = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";

/**
 * Counts page views in PostHog once its key is set (docs/runbooks/monitoring.md): anonymous, per
 * device, with no recordings, no clicks, and no names. Renders nothing.
 */
export function UsageTracking() {
  const pathname = usePathname();

  useEffect(() => {
    if (!key) {
      return;
    }
    void import("posthog-js").then(({ default: posthog }) => {
      if (!posthog.__loaded) {
        posthog.init(key, {
          api_host: host,
          autocapture: false,
          capture_pageview: false,
          capture_pageleave: false,
          capture_dead_clicks: false,
          capture_heatmaps: false,
          capture_exceptions: false,
          capture_performance: false,
          disable_session_recording: true,
          disable_surveys: true,
          persistence: "localStorage",
          person_profiles: "never",
          before_send: (event) => (event ? scrubUsageEvent(event) : null),
        });
      }
      posthog.capture("$pageview", { $pathname: scrubPath(pathname) });
    });
  }, [pathname]);

  return null;
}
