"use client";

import { useEffect } from "react";
import "./globals.css";

/** The last resort when a page crashes: says so plainly, tells Sentry if it's on, and offers a retry. */
export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
      void import("@sentry/nextjs").then((Sentry) => Sentry.captureException(error));
    }
  }, [error]);

  return (
    <html lang="en-CA">
      <body className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-bg p-6 text-center font-sans text-body text-text">
        <h1 className="text-[1.5rem] font-bold">Something went wrong</h1>
        <p className="text-text-secondary">That wasn&apos;t you. Please try again.</p>
        <button
          type="button"
          onClick={reset}
          className="min-h-button rounded-button bg-accent px-3 text-button text-on-accent"
        >
          Try again
        </button>
      </body>
    </html>
  );
}
