"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type PointerEvent, type ReactNode, useEffect, useId, useRef, useState } from "react";
import {
  ClipboardIcon,
  CloseIcon,
  FileTextIcon,
  ListChecksIcon,
  ShieldIcon,
} from "@/components/ui/icons";
import { badgeLabel } from "@/lib/domain/messages";

/** How far the sheet has to be dragged down to close. */
const CLOSE_DISTANCE = 90;

type Tile = {
  href: string;
  label: string;
  hint: string;
  icon: ReactNode;
  count?: number;
};

/**
 * Serve on the phone bar (option A, G 2026-11-13): the tab opens a sheet of the pages under it,
 * so the bar keeps its five tabs as more arrive. Checklist and SOPs for everyone, and Copyright for
 * reviewers, with how many wait for them, which also shows on the tab. It's a native modal
 * <dialog>, like the schedule's panels: the page behind is inert, focus moves in and comes back,
 * Escape and Android's back gesture close it, and so do a tap outside and a drag down. The pages
 * themselves check access on the server; this only offers them.
 */
export function ServeSheet({
  current,
  copyright,
}: {
  current: boolean;
  copyright: { waiting: number } | null;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const pathname = usePathname();
  const [drag, setDrag] = useState(0);
  const dragStart = useRef<number | null>(null);

  // Moving to another page closes it.
  useEffect(() => {
    dialogRef.current?.close();
  }, [pathname]);

  const close = () => {
    dialogRef.current?.close();
    setDrag(0);
  };
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStart.current = event.clientY;
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (dragStart.current !== null) {
      setDrag(Math.max(0, event.clientY - dragStart.current));
    }
  };
  const onPointerEnd = () => {
    if (dragStart.current === null) {
      return;
    }
    dragStart.current = null;
    if (drag > CLOSE_DISTANCE) {
      close();
    } else {
      setDrag(0);
    }
  };

  const waiting = copyright?.waiting ?? 0;
  const tiles: Tile[] = [
    {
      href: "/serve",
      label: "Checklist",
      hint: "Your jobs for the service",
      icon: <ListChecksIcon className="size-5" />,
    },
    {
      href: "/sops",
      label: "SOPs",
      hint: "How we do things",
      icon: <FileTextIcon className="size-5" />,
    },
  ];
  if (copyright) {
    tiles.push({
      href: "/copyright",
      label: "Copyright",
      hint: waiting > 0 ? `${waiting} waiting for you` : "Nothing waiting",
      icon: <ShieldIcon className="size-5" />,
      count: waiting,
    });
  }

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-current={current ? "page" : undefined}
        onClick={() => dialogRef.current?.showModal()}
        className={`relative flex min-h-[3.25rem] w-full flex-col items-center justify-center gap-[3px] text-[0.625rem] transition-colors duration-[var(--duration-base)] ${
          current ? "font-semibold text-accent-light" : "font-medium text-text-muted"
        }`}
      >
        <span
          className={`flex transition-transform duration-[var(--duration-spring)] ease-[var(--ease-spring)] ${
            current ? "-translate-y-px scale-110" : ""
          }`}
        >
          <ClipboardIcon className="size-[1.375rem]" />
        </span>
        Serve
        {waiting > 0 ? (
          <>
            <span
              aria-hidden="true"
              className="absolute top-0.5 left-[calc(50%+0.25rem)] flex h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-pill bg-accent px-1 text-[0.625rem] leading-none font-bold text-on-accent ring-2 ring-surface"
            >
              {badgeLabel(waiting)}
            </span>
            <span className="sr-only">, {waiting} copyright reviews waiting</span>
          </>
        ) : null}
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        onClose={() => setDrag(0)}
        onClick={(event) => {
          // A tap on the backdrop (the dialog element itself) closes it.
          if (event.target === event.currentTarget) {
            close();
          }
        }}
        style={drag > 0 ? { transform: `translateY(${drag}px)`, transition: "none" } : undefined}
        className="backdrop:bg-black/40 fixed inset-x-0 top-auto bottom-0 m-0 w-full max-w-none translate-y-full rounded-t-[1.375rem] border-t border-border bg-surface p-0 pb-[env(safe-area-inset-bottom)] text-left text-text shadow-[0_-8px_30px_rgb(22_20_31/0.16)] transition-[translate,display,overlay] transition-discrete duration-[var(--duration-slow)] ease-standard open:translate-y-0 md:hidden starting:open:translate-y-full"
      >
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          className="flex cursor-grab touch-none justify-center pt-2.5 pb-1"
        >
          <span aria-hidden="true" className="h-1.5 w-10 rounded-pill bg-border-strong/40" />
        </div>
        <div className="flex items-center justify-between gap-2 px-4">
          <h2 id={titleId} className="text-heading font-semibold">
            Serve
          </h2>
          <button
            type="button"
            onClick={close}
            className="inline-flex min-h-touch min-w-11 items-center justify-center rounded-button text-text-secondary hover:bg-hover hover:text-text"
          >
            <CloseIcon />
            <span className="sr-only">Close serve</span>
          </button>
        </div>
        <ul className="grid grid-cols-2 gap-2.5 px-4 pt-1 pb-6">
          {tiles.map((tile) => (
            <li key={tile.href}>
              <Link
                href={tile.href}
                onClick={close}
                aria-current={pathname === tile.href ? "page" : undefined}
                className={`relative flex min-h-28 flex-col gap-2 rounded-card border p-3.5 transition-surface hover:bg-hover ${
                  tile.count ? "border-accent/40 bg-accent-soft/40" : "border-border bg-surface"
                }`}
              >
                <span className="flex size-9 items-center justify-center rounded-button bg-accent-soft text-accent-light">
                  {tile.icon}
                </span>
                <span className="text-body font-semibold">{tile.label}</span>
                <span className="text-small text-text-secondary">{tile.hint}</span>
                {tile.count ? (
                  <span
                    aria-hidden="true"
                    className="absolute top-3 right-3 flex h-[1.375rem] min-w-[1.375rem] items-center justify-center rounded-pill bg-accent px-1.5 text-[0.6875rem] font-bold text-on-accent"
                  >
                    {badgeLabel(tile.count)}
                  </span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      </dialog>
    </>
  );
}
