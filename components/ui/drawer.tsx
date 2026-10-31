"use client";

import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { CloseIcon, MenuIcon } from "./icons";

/**
 * A side drawer on the native modal <dialog> (DESIGN §3, §5, §9): the page behind is inert, focus
 * moves into the drawer, Escape closes it, and focus returns to the button that opened it.
 * It closes when a link inside it navigates.
 */
export function Drawer({
  title,
  triggerLabel,
  children,
  side = "left",
  triggerClassName = "",
}: {
  title: string;
  triggerLabel: string;
  children: ReactNode;
  side?: "left" | "right";
  triggerClassName?: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const pathname = usePathname();

  useEffect(() => {
    dialogRef.current?.close();
  }, [pathname]);

  const position =
    side === "left"
      ? "mr-auto -translate-x-3 starting:open:-translate-x-3"
      : "ml-auto translate-x-3 starting:open:translate-x-3";

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        aria-haspopup="dialog"
        className={`inline-flex min-h-touch min-w-11 items-center justify-center gap-2 rounded-button px-2 text-text-secondary hover:bg-hover hover:text-text ${triggerClassName}`}
      >
        <MenuIcon />
        <span className="sr-only">{triggerLabel}</span>
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        onClick={(event) => {
          // A click on the backdrop (the dialog element itself) closes it.
          if (event.target === event.currentTarget) {
            event.currentTarget.close();
          }
        }}
        className={`m-0 h-dvh max-h-dvh w-[min(20rem,88vw)] max-w-none border-border bg-surface p-0 text-text opacity-0 transition-[opacity,translate,display,overlay] transition-discrete duration-[var(--duration-slow)] ease-standard backdrop:bg-bg/70 open:translate-x-0 open:opacity-100 starting:open:opacity-0 ${position} ${
          side === "left" ? "border-r" : "border-l"
        }`}
      >
        <div className="flex h-full flex-col">
          <div className="flex min-h-14 items-center justify-between gap-2 border-b border-border px-4">
            <p id={titleId} className="font-medium">
              {title}
            </p>
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="inline-flex min-h-touch min-w-11 items-center justify-center rounded-button text-text-secondary hover:bg-hover hover:text-text"
            >
              <CloseIcon />
              <span className="sr-only">Close {title.toLowerCase()}</span>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-3">{children}</div>
        </div>
      </dialog>
    </>
  );
}
