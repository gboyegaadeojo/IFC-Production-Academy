// Browser errors go to Sentry, and page views to PostHog, once their keys are set
// (docs/runbooks/monitoring.md). Neither SDK is downloaded until then, and nothing private leaves the
// browser (lib/domain/monitoring.ts). They download in a quiet moment, so they never compete with
// the page starting up. Both live here, in browser-only code, so the server's bundle (which is what
// a cold start loads) carries neither.
import {
  CLIENT_ERROR_EVENT,
  scrubEvent,
  scrubPath,
  scrubUsageEvent,
  SENTRY_DATA_COLLECTION,
} from "@/lib/domain/monitoring";
import { whenIdle } from "@/lib/domain/when-idle";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";

let sentry: Promise<typeof import("@sentry/nextjs")> | null = null;

function loadSentry() {
  sentry ??= import("@sentry/nextjs").then((Sentry) => {
    Sentry.init({
      dsn,
      dataCollection: SENTRY_DATA_COLLECTION,
      tracesSampleRate: 0,
      beforeSend: (event) => scrubEvent(event),
    });
    return Sentry;
  });
  return sentry;
}

if (dsn) {
  whenIdle(() => void loadSentry());
  // The page's error screen (app/global-error.tsx) hands its error over here.
  window.addEventListener(CLIENT_ERROR_EVENT, (event) => {
    const error = (event as CustomEvent<unknown>).detail;
    void loadSentry().then((Sentry) => Sentry.captureException(error));
  });
}

let lastPath: string | null = null;

/**
 * Counts a page view in PostHog: anonymous, per device, with no recordings, no clicks, and no
 * names. Only when the address's path changes, as before.
 */
function countPageView(pathname: string) {
  if (!posthogKey || pathname === lastPath) {
    return;
  }
  lastPath = pathname;
  whenIdle(() => {
    void import("posthog-js").then(({ default: posthog }) => {
      if (!posthog.__loaded) {
        posthog.init(posthogKey, {
          api_host: posthogHost,
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
  });
}

countPageView(window.location.pathname);

/** Next.js calls this as each move to another page starts. */
export function onRouterTransitionStart(url: string) {
  countPageView(new URL(url, window.location.href).pathname);
}
