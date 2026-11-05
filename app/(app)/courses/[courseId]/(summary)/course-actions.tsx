"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ChevronDownIcon } from "@/components/ui/icons";
import { buttonClasses } from "@/components/ui/button";

/**
 * The Actions menu at the top of a course page (Course Page mock, approved 2026-11-05). A
 * disclosure, like the account menu: Tab moves through it, Escape closes it and returns to the
 * button, and a click outside closes it.
 */
export function CourseActions({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    function onKey(event: KeyboardEvent) {
      // Escape in the Start over warning closes only the warning.
      if (event.key === "Escape" && !document.querySelector("dialog[open]")) {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    function onPointer(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(!open)}
        className={buttonClasses("secondary", "gap-1.5 rounded-pill", "sm")}
      >
        Actions
        <ChevronDownIcon className="size-3.5" />
      </button>
      <div
        id={panelId}
        hidden={!open}
        className="absolute top-full right-0 z-20 mt-2 w-56 rounded-card border border-border bg-surface p-1.5 shadow-[var(--shadow-lift)] [&>a]:flex [&>a]:min-h-touch [&>a]:items-center [&>a]:rounded-button [&>a]:px-2.5 [&>a:hover]:bg-hover [&>button]:min-h-touch [&>button]:w-full [&>button]:justify-start [&>button]:rounded-button [&>button]:px-2.5 [&>button]:text-text [&>button:hover]:bg-hover [&>button:hover]:no-underline"
      >
        {children}
      </div>
    </div>
  );
}
