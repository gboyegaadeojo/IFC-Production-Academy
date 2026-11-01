"use client";

import { useId, useRef, type ReactNode } from "react";
import { Button, type ButtonVariant } from "./button";

/**
 * Asks before something hard to undo, on the native modal <dialog> (DESIGN §5, §9): the page
 * behind is inert, focus moves in, Escape or Cancel closes it, and focus returns to the button.
 * The confirming form goes in `children`, usually an ActionForm.
 */
export function ConfirmDialog({
  triggerLabel,
  srLabel,
  title,
  message,
  children,
  variant = "tertiary",
}: {
  triggerLabel: string;
  /** Extra words for screen readers, such as which item. */
  srLabel?: string;
  title: string;
  message: ReactNode;
  children: ReactNode;
  variant?: ButtonVariant;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const messageId = useId();
  return (
    <>
      <Button
        variant={variant}
        aria-haspopup="dialog"
        onClick={() => dialogRef.current?.showModal()}
      >
        {triggerLabel}
        {srLabel ? <span className="sr-only"> {srLabel}</span> : null}
      </Button>
      <dialog
        ref={dialogRef}
        role="alertdialog"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-card border border-border bg-surface p-5 text-left text-text backdrop:bg-bg/70"
      >
        <div className="flex flex-col gap-4">
          <h2 id={titleId} className="text-subheading font-semibold">
            {title}
          </h2>
          <div id={messageId} className="text-text-secondary">
            {message}
          </div>
          <div className="flex flex-wrap items-start gap-3">
            {children}
            <Button variant="secondary" onClick={() => dialogRef.current?.close()}>
              Cancel
            </Button>
          </div>
        </div>
      </dialog>
    </>
  );
}
