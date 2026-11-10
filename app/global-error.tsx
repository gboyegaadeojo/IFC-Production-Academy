"use client";

import { useEffect } from "react";
import { CLIENT_ERROR_EVENT } from "@/lib/domain/monitoring";
import "./globals.css";

/**
 * The last resort when a page crashes: says so plainly, tells Sentry if it's on, and offers a retry.
 * The browser's Sentry (instrumentation-client.ts) reports it, so this page doesn't import Sentry,
 * which would put another copy in the server's bundle.
 */
export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    window.dispatchEvent(new CustomEvent(CLIENT_ERROR_EVENT, { detail: error }));
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
