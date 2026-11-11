"use client";

import { usePathname } from "next/navigation";
import { useActionState, useEffect, useId, useRef, useState } from "react";
import { reportProblemAction } from "@/app/(app)/report-problem-action";
import type { FormState } from "@/components/ui/action-form";
import { Button } from "@/components/ui/button";
import { fieldClasses } from "@/components/ui/field-classes";
import { CloseIcon } from "@/components/ui/icons";
import { deviceSummary, pagePath, REPORT_MAX_LENGTH } from "@/lib/domain/problem-reports";

const idle: FormState = { status: "idle" };

/**
 * Report a problem (mock, 2026-11-11): a sheet from the bottom on a phone, a dialog on a computer.
 * A native modal <dialog>, so focus moves in and back, Escape closes it, and so does Android's back
 * gesture. Sends the note with the page's path, a device summary, and the app version, which the
 * sheet shows before sending.
 */
export function ReportProblemDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const pathname = usePathname();
  // A new form each time it opens, so a sent report doesn't stay on screen.
  const [round, setRound] = useState(0);
  const [device, setDevice] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    if (open && !dialog.open) {
      setRound((n) => n + 1);
      setDevice(
        deviceSummary(
          navigator.userAgent,
          window.matchMedia("(display-mode: standalone)").matches ||
            (navigator as Navigator & { standalone?: boolean }).standalone === true,
        ),
      );
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      className="backdrop:bg-black/40 fixed inset-x-0 top-auto bottom-0 m-0 max-h-[85dvh] w-full max-w-none rounded-t-[1.375rem] border-t border-border bg-surface p-0 pb-[env(safe-area-inset-bottom)] text-left text-text shadow-[0_-8px_30px_rgb(22_20_31/0.16)] sm:inset-0 sm:m-auto sm:h-fit sm:w-[min(30rem,calc(100vw-2rem))] sm:rounded-card sm:border sm:pb-0"
    >
      <div className="flex justify-center pt-2.5 pb-1 sm:hidden">
        <span aria-hidden="true" className="h-1.5 w-10 rounded-pill bg-border-strong/40" />
      </div>
      <div className="flex items-center justify-between gap-2 px-4 sm:pt-3">
        <h2 id={titleId} className="text-heading font-semibold">
          Report a problem
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex min-h-touch min-w-11 items-center justify-center rounded-button text-text-secondary hover:bg-hover hover:text-text"
        >
          <CloseIcon />
          <span className="sr-only">Close</span>
        </button>
      </div>
      {open ? (
        <ReportForm
          key={round}
          page={pagePath(pathname)}
          device={device}
          appVersion={process.env.NEXT_PUBLIC_APP_VERSION ?? ""}
          onClose={onClose}
        />
      ) : null}
    </dialog>
  );
}

function ReportForm({
  page,
  device,
  appVersion,
  onClose,
}: {
  page: string;
  device: string;
  appVersion: string;
  onClose: () => void;
}) {
  const [state, formAction, pending] = useActionState(reportProblemAction, idle);
  const messageId = useId();
  const errorId = useId();

  if (state.status === "done") {
    return (
      <div className="flex flex-col gap-4 px-4 pt-2 pb-6">
        <p role="status" className="font-medium text-success">
          {state.message}
        </p>
        <Button type="button" variant="secondary" onClick={onClose}>
          Close
        </Button>
      </div>
    );
  }

  const facts = [
    page ? `Page: ${page}` : null,
    device || null,
    appVersion ? `Version ${appVersion}` : null,
  ].filter((fact): fact is string => fact !== null);

  return (
    <form action={formAction} className="flex flex-col gap-4 px-4 pt-2 pb-6">
      <input type="hidden" name="page" value={page} />
      <input type="hidden" name="device" value={device} />
      <input type="hidden" name="appVersion" value={appVersion} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor={messageId} className="font-medium">
          What happened?
        </label>
        <textarea
          id={messageId}
          name="message"
          rows={4}
          required
          maxLength={REPORT_MAX_LENGTH}
          placeholder="For example: I ticked Camera 2 and it went back"
          aria-describedby={state.status === "error" ? errorId : undefined}
          className={`${fieldClasses} min-h-28 resize-y py-2.5`}
        />
      </div>
      <div className="flex flex-col gap-2 rounded-card border border-border bg-card p-3">
        <p className="text-small font-medium text-text-secondary">
          Sent with your note, so the team can find it
        </p>
        <ul className="flex flex-wrap gap-1.5">
          {facts.map((fact) => (
            <li
              key={fact}
              className="rounded-pill bg-hover px-2.5 py-0.5 text-small text-text-secondary"
            >
              {fact}
            </li>
          ))}
        </ul>
      </div>
      {state.status === "error" ? (
        <p id={errorId} role="alert" className="text-danger text-small">
          {state.message}
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Sending…" : "Send to the team"}
      </Button>
    </form>
  );
}
