"use client";

import { usePathname } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from "react";
import { CloseIcon } from "./icons";

/**
 * Panels a page opens over itself (schedule D, G 2026-11-10): a sheet that slides up from the
 * bottom on a phone, and a panel on the right from 1024px. It's a native modal <dialog>, so the
 * page behind is inert, focus moves in and comes back, Escape closes it, and so does Android's
 * back gesture (Chrome treats it as the dialog's cancel). On a phone it can also be dragged down
 * by its handle; tapping outside closes it too. The content is rendered by the server and passed in,
 * so forms inside work as anywhere else, and a saved change refreshes it in place.
 */
type Panel = { key: string; title: string; content: ReactNode };

const PanelContext = createContext<{
  openKey: string | null;
  open: (key: string) => void;
  close: () => void;
} | null>(null);

function usePanels() {
  const context = useContext(PanelContext);
  if (!context) {
    throw new Error("Panel buttons belong inside a PanelHost.");
  }
  return context;
}

/** How far a sheet has to be dragged down to close. */
const CLOSE_DISTANCE = 90;

export function PanelHost({ panels, children }: { panels: Panel[]; children: ReactNode }) {
  const pathname = usePathname();
  // Open only on the page where it was opened, so moving to another page closes it.
  const [opened, setOpened] = useState<{ key: string; on: string } | null>(null);
  const openKey = opened?.on === pathname ? opened.key : null;
  const [drag, setDrag] = useState(0);
  const dragStart = useRef<number | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const panel = panels.find((p) => p.key === openKey);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    if (openKey && !dialog.open) {
      dialog.showModal();
    } else if (!openKey && dialog.open) {
      dialog.close();
    }
  }, [openKey]);

  const close = () => {
    setOpened(null);
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

  return (
    <PanelContext.Provider
      value={{ openKey, open: (key) => setOpened({ key, on: pathname }), close }}
    >
      {children}
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        onClose={close}
        onClick={(event) => {
          // A tap on the backdrop (the dialog element itself) closes it.
          if (event.target === event.currentTarget) {
            close();
          }
        }}
        style={drag > 0 ? { transform: `translateY(${drag}px)`, transition: "none" } : undefined}
        className="backdrop:bg-black/40 fixed inset-x-0 top-auto bottom-0 m-0 max-h-[85dvh] w-full max-w-none translate-y-full rounded-t-[1.375rem] border-t border-border bg-surface p-0 pb-[env(safe-area-inset-bottom)] text-left text-text shadow-[0_-8px_30px_rgb(22_20_31/0.16)] transition-[translate,display,overlay] transition-discrete duration-[var(--duration-slow)] ease-standard open:translate-y-0 lg:inset-y-0 lg:right-0 lg:left-auto lg:h-dvh lg:max-h-dvh lg:w-[min(28rem,100vw)] lg:translate-x-full lg:translate-y-0 lg:rounded-none lg:border-t-0 lg:border-l lg:pb-0 lg:open:translate-x-0 starting:open:translate-y-full lg:starting:open:translate-x-full"
      >
        <div className="flex max-h-[inherit] flex-col lg:h-full">
          <div
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerEnd}
            onPointerCancel={onPointerEnd}
            className="flex shrink-0 cursor-grab touch-none justify-center pt-2.5 pb-1 lg:hidden"
          >
            <span aria-hidden="true" className="h-1.5 w-10 rounded-pill bg-border-strong/40" />
          </div>
          <div className="flex shrink-0 items-center justify-between gap-2 px-4 lg:min-h-14 lg:border-b lg:border-border">
            <h2 id={titleId} className="text-heading font-semibold">
              {panel?.title}
            </h2>
            <button
              type="button"
              onClick={close}
              className="inline-flex min-h-touch min-w-11 items-center justify-center rounded-button text-text-secondary hover:bg-hover hover:text-text"
            >
              <CloseIcon />
              <span className="sr-only">Close {panel?.title.toLowerCase()}</span>
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-1 pb-6">{panel?.content}</div>
        </div>
      </dialog>
    </PanelContext.Provider>
  );
}

/** A button that opens one of the host's panels. */
export function PanelButton({
  panel,
  className,
  children,
}: {
  panel: string;
  className: string;
  children: ReactNode;
}) {
  const { open } = usePanels();
  return (
    <button type="button" aria-haspopup="dialog" onClick={() => open(panel)} className={className}>
      {children}
    </button>
  );
}

/**
 * The phone's row of tabs (schedule D): the first is the page itself; the others open their
 * panel as a sheet, and stay lit while it's open. Below 1024px only.
 */
export function PanelTabs({
  pageLabel,
  tabs,
}: {
  pageLabel: string;
  tabs: { panel: string; label: string; count?: number }[];
}) {
  const { openKey, open, close } = usePanels();
  const base =
    "flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-pill px-2 text-small font-semibold transition-surface";
  const on = "bg-accent text-on-accent";
  const off = "text-text-secondary hover:text-text";
  return (
    <div className="flex gap-1 rounded-pill border border-border bg-surface p-1 lg:hidden">
      <button
        type="button"
        aria-current={openKey === null ? "page" : undefined}
        onClick={close}
        className={`${base} ${openKey === null ? on : off}`}
      >
        {pageLabel}
      </button>
      {tabs.map((tab) => (
        <button
          key={tab.panel}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={openKey === tab.panel}
          onClick={() => open(tab.panel)}
          className={`${base} ${openKey === tab.panel ? on : off}`}
        >
          {tab.label}
          {tab.count ? <span className="tabular">· {tab.count}</span> : null}
        </button>
      ))}
    </div>
  );
}
