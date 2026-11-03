import type { Instrumentation } from "next";

// Server errors reach Sentry through this hook. The Worker sets Sentry up (workers/entry.ts), and
// with no address set it's off. See docs/runbooks/monitoring.md.
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) {
    return;
  }
  const Sentry = await import("@sentry/nextjs");
  Sentry.captureRequestError(error, request, context);
};
