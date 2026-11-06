"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { NotificationIcon } from "@/components/notification-icon";
import {
  BellIcon,
  CheckIcon,
  ChevronRightIcon,
  CloseIcon,
  SettingsIcon,
} from "@/components/ui/icons";
import {
  clearNotificationsAction,
  latestNotificationsAction,
  markAllReadAction,
  type PanelNotification,
} from "@/app/(app)/notifications/actions";

type Items = PanelNotification[] | "loading" | "error";

/**
 * The bell beside the account button (mock 5; refinements, approved 2026-11-06). It opens a panel
 * of the newest notifications instead of a page: a sheet from the bottom on a phone, a panel beside
 * the side bar from 768px. Tapping the bell again, Escape, or tapping outside closes it, and so does
 * moving to another page. Mark all read clears the dot and keeps them; Clear all (after asking)
 * and each one's × take them out of the list, kept on record (G, 2026-11-06). Each says what kind
 * it is and what following it does. The dot shows there's something unread, and the count is in
 * the bell's name, so colour is never the only signal.
 */
export function NotificationsBell({
  unread,
  placement,
}: {
  unread: number;
  placement: "header" | "rail";
}) {
  const pathname = usePathname();
  // Open only on the page where it was opened, so following a notification closes it.
  const [openedOn, setOpenedOn] = useState<string | null>(null);
  const open = openedOn === pathname;
  const [items, setItems] = useState<Items>("loading");
  const [allRead, setAllRead] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const headingId = useId();
  const panelId = useId();

  const unreadNow = allRead ? 0 : unread;
  const label =
    unreadNow > 0 ? `Notifications, ${unreadNow > 99 ? "99+" : unreadNow} unread` : "Notifications";

  function close() {
    setOpenedOn(null);
  }

  function toggle() {
    if (open) {
      close();
      return;
    }
    setOpenedOn(pathname);
    setAllRead(false);
    setConfirming(false);
    setMessage("");
    setItems("loading");
    startTransition(async () => {
      const result = await latestNotificationsAction();
      setItems(result.ok ? result.items : "error");
    });
  }

  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenedOn(null);
        buttonRef.current?.focus();
      }
    }
    function onPointer(event: PointerEvent) {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target)) return; // The bell toggles it itself.
      if (target === backdropRef.current || !panelRef.current?.contains(target)) {
        setOpenedOn(null);
      }
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  function markAllRead() {
    startTransition(async () => {
      const result = await markAllReadAction();
      if (result.status === "done") {
        setAllRead(true);
        setItems((current) =>
          Array.isArray(current) ? current.map((item) => ({ ...item, read: true })) : current,
        );
      }
    });
  }

  /** Takes them out of the list straight away, and puts them back if the save fails. */
  function clear(ids: string[] | null) {
    const before = items;
    setConfirming(false);
    setItems((current) =>
      Array.isArray(current)
        ? ids
          ? current.filter((item) => !ids.includes(item.id))
          : []
        : current,
    );
    startTransition(async () => {
      const result = await clearNotificationsAction(ids);
      if (result.ok) {
        setMessage(ids ? "Cleared." : "All cleared.");
      } else {
        setItems(before);
        setMessage("That didn't clear. Check your connection and try again.");
      }
    });
  }

  const shown = Array.isArray(items) ? items : [];
  const anyUnread = !allRead && (unread > 0 || shown.some((item) => !item.read));
  const sheet = placement === "header";

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        title="Notifications"
        onClick={toggle}
        className={`relative flex size-10 shrink-0 items-center justify-center rounded-pill transition-surface ${
          open ? "bg-accent-soft text-accent-light" : "bg-card text-text hover:bg-hover"
        }`}
      >
        <BellIcon className="size-5" />
        {unreadNow > 0 ? (
          <span
            aria-hidden="true"
            className="absolute top-2 right-2.5 size-2 rounded-pill bg-error ring-2 ring-card"
          />
        ) : null}
      </button>
      {open
        ? createPortal(
            <>
              {sheet ? (
                <div
                  ref={backdropRef}
                  aria-hidden="true"
                  className="bg-black/40 fixed inset-x-0 top-[calc(3.5rem+1px+env(safe-area-inset-top))] bottom-0 z-40 print:hidden"
                />
              ) : null}
              <div
                ref={panelRef}
                id={panelId}
                role="dialog"
                aria-labelledby={headingId}
                tabIndex={-1}
                className={`fixed z-50 flex flex-col overflow-hidden border border-border bg-surface text-text shadow-[0_18px_50px_rgb(0_0_0/0.22)] outline-none print:hidden ${
                  sheet
                    ? "inset-x-0 bottom-0 max-h-[75dvh] rounded-t-[1.375rem] border-b-0 pb-[env(safe-area-inset-bottom)]"
                    : "bottom-4 left-[6.5rem] max-h-[min(36rem,calc(100dvh-2rem))] w-96 rounded-[1rem]"
                }`}
              >
                {sheet ? (
                  <span
                    aria-hidden="true"
                    className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-pill bg-border-strong/40"
                  />
                ) : null}
                <div className="flex shrink-0 items-center justify-between gap-2 pt-2 pr-2 pl-4">
                  <h2 id={headingId} className="text-body font-bold">
                    Notifications
                  </h2>
                  <Link
                    href="/notifications/settings"
                    aria-label="Notification settings"
                    title="Notification settings"
                    onClick={close}
                    className="flex size-10 items-center justify-center rounded-pill text-text-secondary transition-surface hover:bg-hover hover:text-text"
                  >
                    <SettingsIcon className="size-[1.125rem]" />
                  </Link>
                </div>
                {/* Two quiet pills: Mark all read keeps them; Clear all asks first, then empties it. */}
                <div className="flex min-h-11 shrink-0 items-center gap-2 px-4 pb-2.5">
                  {confirming ? (
                    <>
                      <span className="mr-auto text-small font-medium">
                        Clear all notifications?
                      </span>
                      <button type="button" onClick={() => setConfirming(false)} className={PILL}>
                        Cancel
                      </button>
                      <button type="button" onClick={() => clear(null)} className={PILL_STRONG}>
                        Clear all
                      </button>
                    </>
                  ) : (
                    <>
                      {/* Always there, so people know where it is; greyed out with nothing unread. */}
                      <button
                        type="button"
                        onClick={markAllRead}
                        disabled={pending || !anyUnread}
                        title={anyUnread ? undefined : "Everything is read"}
                        className={PILL}
                      >
                        <CheckIcon className="size-3.5" />
                        Mark all read
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirming(true)}
                        disabled={pending || shown.length === 0}
                        title={shown.length === 0 ? "Nothing to clear" : undefined}
                        className={PILL}
                      >
                        <CloseIcon className="size-3.5" />
                        Clear all
                      </button>
                    </>
                  )}
                </div>
                <p role="status" className="sr-only">
                  {message}
                </p>
                <div className="min-h-0 flex-1 overflow-y-auto border-t border-border">
                  {items === "loading" ? (
                    <p role="status" className="px-4 py-6 text-small text-text-muted">
                      Loading…
                    </p>
                  ) : items === "error" ? (
                    <p role="alert" className="px-4 py-6 text-small text-text-secondary">
                      Notifications couldn&apos;t load. Check your connection and try again.
                    </p>
                  ) : items.length === 0 ? (
                    <p className="px-4 py-6 text-small text-text-secondary">
                      You&apos;re all caught up. New updates, like being scheduled or an assessment
                      result, show here.
                    </p>
                  ) : (
                    <ul className="divide-y divide-border">
                      {items.map((item) => (
                        <li key={item.id} className="relative">
                          <Link
                            href={item.href}
                            onClick={close}
                            className="grid min-h-touch grid-cols-[2rem_minmax(0,1fr)] items-start gap-3 py-3 pr-12 pl-4 transition-surface hover:bg-card"
                          >
                            <NotificationIcon kind={item.kind} small />
                            <span className="flex min-w-0 flex-col gap-0.5">
                              <span className="flex items-center gap-2">
                                {item.read ? null : (
                                  <span
                                    aria-hidden="true"
                                    className="size-2 shrink-0 rounded-pill bg-accent-light"
                                  />
                                )}
                                <span className={item.read ? "" : "font-semibold"}>
                                  {item.read ? null : <span className="sr-only">Unread: </span>}
                                  {item.title}
                                </span>
                              </span>
                              {item.body ? (
                                <span className="line-clamp-2 text-small text-text-secondary">
                                  {item.body}
                                </span>
                              ) : null}
                              {/* Where it goes, in words, so it's clear what to do next. */}
                              <span className="mt-0.5 flex items-center gap-1 text-small font-semibold text-accent-light">
                                {item.action}
                                <ChevronRightIcon className="size-3.5" />
                                <time
                                  dateTime={item.createdAt}
                                  title={item.at}
                                  className="ml-auto font-normal whitespace-nowrap text-text-muted"
                                >
                                  <span aria-hidden="true">{item.when}</span>
                                  <span className="sr-only">{item.at}</span>
                                </time>
                              </span>
                            </span>
                          </Link>
                          <button
                            type="button"
                            onClick={() => clear([item.id])}
                            aria-label={`Clear: ${item.title}`}
                            title="Clear"
                            className="absolute top-2 right-2 flex size-8 items-center justify-center rounded-pill text-text-muted transition-surface hover:bg-hover hover:text-text"
                          >
                            <CloseIcon className="size-4" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <Link
                  href="/notifications"
                  onClick={close}
                  className="flex min-h-touch shrink-0 items-center justify-center border-t border-border text-small font-semibold text-accent-light hover:underline"
                >
                  See all notifications
                </Link>
              </div>
            </>,
            document.body,
          )
        : null}
    </>
  );
}

// Shape only; each kind adds its own colours, so no two colour classes ever compete (a clash left
// the confirm button white on white in dark mode).
const PILL_SHAPE =
  "inline-flex min-h-8 items-center gap-1.5 rounded-pill border px-3 text-[0.75rem] font-semibold transition-surface";
const PILL = `${PILL_SHAPE} border-border bg-surface text-text hover:bg-hover disabled:cursor-default disabled:text-text-muted disabled:hover:bg-surface`;
/** The one that does it, after asking: filled, the inverse of the page. */
const PILL_STRONG = `${PILL_SHAPE} border-text bg-text text-bg hover:opacity-90`;
