"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type PointerEvent, type ReactNode, useEffect, useId, useRef, useState } from "react";
import { serveSheetAction } from "@/app/(app)/serve-sheet-actions";
import {
  ChevronRightIcon,
  ClipboardIcon,
  CloseIcon,
  FileTextIcon,
  ShieldIcon,
} from "@/components/ui/icons";
import { badgeLabel } from "@/lib/domain/messages";
import {
  copyrightLine,
  serviceHeading,
  serviceProgressLine,
  sopsLine,
  type ServeSheetSummary,
} from "@/lib/domain/serve-sheet";

/** How far the sheet has to be dragged down to close. */
const CLOSE_DISTANCE = 90;

/**
 * Serve on the phone bar (option A, G 2026-11-13): the tab opens a sheet of the pages under it,
 * so the bar keeps its five tabs as more arrive. The sheet puts your next service first, with
 * how far along its checklist is, then Copyright for reviewers and SOPs (sheet B, G 2026-11-13).
 * The details load when it opens, so other pages don't wait for them, and it works without them.
 * It's a native modal <dialog>, like the schedule's panels: the page behind is inert, focus moves
 * in and comes back, Escape and Android's back gesture close it, and so do a tap outside and a
 * drag down. The pages themselves check access on the server; this only offers them.
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
  const [details, setDetails] = useState<ServeSheetSummary | null>(null);
  const [loading, setLoading] = useState(false);

  // Moving to another page closes it.
  useEffect(() => {
    dialogRef.current?.close();
  }, [pathname]);

  const open = () => {
    dialogRef.current?.showModal();
    setLoading(true);
    void serveSheetAction()
      .then((summary) => {
        if (summary) {
          setDetails(summary);
        }
      })
      .finally(() => setLoading(false));
  };
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

  // The tab's count comes with the page; the sheet's details may be fresher.
  const reviews =
    details?.copyright ?? (copyright ? { waiting: copyright.waiting, firstDay: null } : null);
  const waiting = copyright ? (reviews?.waiting ?? 0) : 0;

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-current={current ? "page" : undefined}
        onClick={open}
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
        aria-busy={loading}
        onClose={() => setDrag(0)}
        onClick={(event) => {
          // A tap on the backdrop (the dialog element itself) closes it.
          if (event.target === event.currentTarget) {
            close();
          }
        }}
        style={drag > 0 ? { transform: `translateY(${drag}px)`, transition: "none" } : undefined}
        className="backdrop:bg-black/40 fixed inset-x-0 top-auto bottom-0 m-0 max-h-[85dvh] w-full max-w-none translate-y-full overflow-y-auto rounded-t-[1.375rem] border-t border-border bg-surface p-0 pb-[env(safe-area-inset-bottom)] text-left text-text shadow-[0_-8px_30px_rgb(22_20_31/0.16)] transition-[translate,display,overlay] transition-discrete duration-[var(--duration-slow)] ease-standard open:translate-y-0 md:hidden starting:open:translate-y-full"
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
        <div className="flex flex-col gap-2.5 px-4 pt-1 pb-6">
          <NextService details={details} loading={loading} onChoose={close} />
          <ul className="flex flex-col gap-1">
            {reviews ? (
              <Row
                href="/copyright"
                label="Copyright"
                hint={
                  details?.copyright
                    ? copyrightLine(details.copyright)
                    : `${reviews.waiting} waiting`
                }
                icon={<ShieldIcon className="size-5" />}
                count={reviews.waiting}
                current={pathname.startsWith("/copyright")}
                onChoose={close}
              />
            ) : null}
            <Row
              href="/sops"
              label="SOPs"
              hint={sopsLine(details?.sopsUpdatedThisWeek ?? 0)}
              icon={<FileTextIcon className="size-5" />}
              current={pathname.startsWith("/sops")}
              onChoose={close}
            />
          </ul>
        </div>
      </dialog>
    </>
  );
}

/** Your next service, with its checklist's progress and one way in. */
function NextService({
  details,
  loading,
  onChoose,
}: {
  details: ServeSheetSummary | null;
  loading: boolean;
  onChoose: () => void;
}) {
  const headingId = useId();
  const service = details?.service ?? null;
  const percent =
    service && service.total > 0 ? Math.round((service.done / service.total) * 100) : 0;
  let heading: string;
  let line: string;
  if (service) {
    heading = serviceHeading(service);
    line = serviceProgressLine(service);
  } else if (details || !loading) {
    heading = "No service on the schedule yet";
    line = "Its checklist opens here once it's on the schedule.";
  } else {
    heading = "Finding your next service…";
    line = "";
  }
  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-1 rounded-card bg-accent p-4 text-on-accent"
    >
      <p className="text-[0.6875rem] font-bold tracking-[0.06em] uppercase opacity-85">
        Your next service
      </p>
      <h3 id={headingId} className="text-[1.1875rem] leading-tight font-bold">
        {heading}
      </h3>
      {line ? <p className="text-small opacity-90">{line}</p> : null}
      {service && service.total > 0 ? (
        <div
          role="progressbar"
          aria-label="Checklist progress"
          aria-valuemin={0}
          aria-valuemax={service.total}
          aria-valuenow={service.done}
          className="mt-2 h-1.5 overflow-hidden rounded-pill bg-on-accent/30"
        >
          <div className="h-full rounded-pill bg-on-accent" style={{ width: `${percent}%` }} />
        </div>
      ) : null}
      <Link
        href={service ? `/serve/${service.id}` : "/serve"}
        onClick={onChoose}
        className="mt-3 flex min-h-11 items-center justify-center rounded-pill bg-surface text-body font-bold text-accent-light"
      >
        {service ? "Open my checklist" : "Open the checklist"}
      </Link>
    </section>
  );
}

function Row({
  href,
  label,
  hint,
  icon,
  count = 0,
  current,
  onChoose,
}: {
  href: string;
  label: string;
  hint: string;
  icon: ReactNode;
  count?: number;
  current: boolean;
  onChoose: () => void;
}) {
  return (
    <li>
      <Link
        href={href}
        onClick={onChoose}
        aria-current={current ? "page" : undefined}
        className={`flex min-h-14 items-center gap-3 rounded-card p-3 transition-surface hover:bg-hover ${
          count > 0 ? "bg-accent-soft/50" : ""
        }`}
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-button bg-accent-soft text-accent-light">
          {icon}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-body font-semibold">{label}</span>
          <span className="truncate text-small text-text-secondary">{hint}</span>
        </span>
        {count > 0 ? (
          <span
            aria-hidden="true"
            className="flex h-[1.375rem] min-w-[1.375rem] items-center justify-center rounded-pill bg-accent px-1.5 text-[0.6875rem] font-bold text-on-accent"
          >
            {badgeLabel(count)}
          </span>
        ) : (
          <ChevronRightIcon className="size-4 text-text-muted" />
        )}
      </Link>
    </li>
  );
}
