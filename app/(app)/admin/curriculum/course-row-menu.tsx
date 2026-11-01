"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { ActionForm } from "@/components/ui/action-form";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { discardDraftCourseAction } from "./actions";

/**
 * The ⋯ menu on a course that has never been published (approved mock, 2026-11-01): open it, or
 * delete it if it was added by mistake. Published courses have no Delete; they're archived from
 * the course page, so nobody's history changes (SRS-CUR-008). A disclosure, not an ARIA menu.
 */
export function CourseRowMenu({ courseId, title }: { courseId: string; title: string }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    function onPointer(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(event: KeyboardEvent) {
      // The confirm dialog handles its own Escape.
      if (event.key === "Escape" && !document.querySelector("dialog[open]")) {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(!open)}
        className="flex size-9 items-center justify-center rounded-button text-text-muted transition-surface hover:bg-hover hover:text-text"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="currentColor">
          <circle cx="5" cy="12" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="19" cy="12" r="1.8" />
        </svg>
        <span className="sr-only">More for {title}</span>
      </button>
      {open ? (
        <div
          id={panelId}
          className="absolute top-full right-0 z-30 mt-1 flex w-60 flex-col rounded-card border border-border bg-surface p-1.5 shadow-[0_16px_40px_-16px_rgba(0,0,0,0.35)]"
        >
          <Link
            href={`/admin/curriculum/${courseId}`}
            className="flex min-h-control items-center rounded-button px-2.5 text-small transition-surface hover:bg-hover"
          >
            Open course
          </Link>
          <ConfirmDialog
            triggerLabel="Delete draft course"
            srLabel={title}
            variant="tertiary"
            title={`Delete “${title}”?`}
            message="It's never been published, so no one has learned from it. Its draft lessons and quizzes go with it. This is recorded in the audit log."
          >
            <ActionForm
              action={discardDraftCourseAction}
              submitLabel="Delete course"
              pendingLabel="Deleting…"
              variant="destructive"
              hidden={{ courseId }}
            />
          </ConfirmDialog>
          <p className="px-2.5 pt-1 pb-1.5 text-small text-text-muted">
            It&apos;s never been published, so nobody has learned from it.
          </p>
        </div>
      ) : null}
    </div>
  );
}
