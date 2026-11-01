"use client";

import { useState } from "react";

/**
 * "Continue with Planning Center": a plain link to the existing sign-in route, with a busy state
 * after the first press so it can't be pressed twice while Planning Center loads. The look was
 * approved in the sign-in mock (G, 2026-11-01): the inverse of the page, not the purple action.
 */
export function PlanningCenterButton({ href }: { href: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <a
      href={href}
      aria-busy={busy}
      aria-disabled={busy}
      onClick={(event) => {
        if (busy) {
          event.preventDefault();
          return;
        }
        setBusy(true);
      }}
      className="inline-flex h-[54px] w-full items-center justify-center gap-2.5 rounded-[11px] bg-text px-5 text-body font-semibold text-bg transition-[opacity,transform] duration-[var(--duration-base)] ease-standard hover:opacity-90 active:translate-y-px aria-busy:cursor-progress aria-busy:opacity-80"
    >
      {busy ? (
        <span
          aria-hidden="true"
          className="size-4 rounded-pill border-2 border-bg/30 border-t-bg motion-safe:animate-spin"
        />
      ) : (
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="size-[18px]"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M9 12h6M12 9v6" />
        </svg>
      )}
      {busy ? "Opening Planning Center…" : "Continue with Planning Center"}
      {busy ? (
        <span role="status" className="sr-only">
          Opening Planning Center
        </span>
      ) : null}
    </a>
  );
}
