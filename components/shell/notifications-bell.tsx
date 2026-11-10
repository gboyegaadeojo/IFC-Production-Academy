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
import {
  notificationGroupOf,
  panelFilterGroups,
  type NotificationGroup,
} from "@/lib/domain/notifications";

type Items = PanelNotification[] | "loading" | "error";
type Filter = "all" | NotificationGroup["id"];

/**
 * The bell beside the account button (mock 5; refinements, approved 2026-11-06). It opens a panel
 * of the newest notifications instead of a page: on a phone a sheet that pulls down from under the
 * top bar, with a point at the bell and the bell tipping as it opens (notifications B, G
 * 2026-11-10), and a panel beside the side bar from 768px. Both split New from Earlier and can be
 * filtered by group. Tapping the bell again, Escape, or tapping outside closes it, and so does
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
  const [panelLeft, setPanelLeft] = useState<number | null>(null);
  // How far the phone sheet's point sits from its right edge, so it points at the bell.
  const [pointerRight, setPointerRight] = useState(70);
  const [filter, setFilter] = useState<Filter>("all");
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
    // Beside the side bar, which is narrower when folded to icons.
    const sidebar = buttonRef.current?.closest("aside");
    setPanelLeft(sidebar ? sidebar.getBoundingClientRect().right + 8 : null);
    const bell = buttonRef.current?.getBoundingClientRect();
    if (bell) {
      // The sheet is 8px in from the screen's edge, and the point is 12px wide.
      setPointerRight(window.innerWidth - (bell.left + bell.width / 2) - 8 - 6);
    }
    setFilter("all");
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
  const filterGroups = panelFilterGroups(shown.map((item) => item.kind));
  const filtered =
    filter === "all" ? shown : shown.filter((item) => notificationGroupOf(item.kind) === filter);
  // Unread first, under New, then Earlier (notifications B, G 2026-11-10).
  const listGroups = [
    { label: "New", items: filtered.filter((item) => !item.read) },
    { label: "Earlier", items: filtered.filter((item) => item.read) },
  ].filter((group) => group.items.length > 0);

  const panel = (
    <div
      ref={panelRef}
      id={panelId}
      role="dialog"
      aria-labelledby={headingId}
      tabIndex={-1}
      style={sheet || panelLeft === null ? undefined : { left: panelLeft }}
      className={`flex flex-col overflow-hidden border border-border bg-surface text-text shadow-[0_18px_50px_rgb(0_0_0/0.22)] outline-none print:hidden ${
        sheet
          ? "relative max-h-[calc(100dvh-3.5rem-env(safe-area-inset-top)-2rem)] rounded-[1.375rem]"
          : "fixed bottom-4 left-[6.5rem] z-50 max-h-[min(36rem,calc(100dvh-2rem))] w-96 rounded-[1rem]"
      }`}
    >
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
            <span className="mr-auto text-small font-medium">Clear all notifications?</span>
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
      {/* Filters only when there's more than one kind of thing to choose between. */}
      {filterGroups.length > 1 ? (
        <div role="group" aria-label="Show" className="flex shrink-0 flex-wrap gap-1.5 px-4 pb-2.5">
          {[{ id: "all" as const, title: "All" }, ...filterGroups].map((choice) => (
            <button
              key={choice.id}
              type="button"
              aria-pressed={filter === choice.id}
              onClick={() => setFilter(choice.id)}
              className="min-h-8 rounded-pill bg-hover px-3 text-small font-semibold text-text-secondary transition-surface aria-pressed:bg-text aria-pressed:text-bg"
            >
              {choice.title}
            </button>
          ))}
        </div>
      ) : null}
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
            You&apos;re all caught up. New updates, like being scheduled or an assessment result,
            show here.
          </p>
        ) : filtered.length === 0 ? (
          <p className="px-4 py-6 text-small text-text-secondary">Nothing here right now.</p>
        ) : (
          listGroups.map((group) => (
            <section key={group.label} aria-label={group.label}>
              <h3 className="px-4 pt-3 pb-1 text-[0.6875rem] font-semibold tracking-[0.04em] text-text-muted uppercase">
                {group.label}
              </h3>
              <ul className="divide-y divide-border">
                {group.items.map((item) => (
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
            </section>
          ))
        )}
      </div>
      <Link
        href="/notifications"
        onClick={close}
        className="flex min-h-touch shrink-0 items-center justify-center border-t border-border text-small font-semibold text-accent-light hover:underline"
      >
        See all notifications
      </Link>
      {sheet ? (
        <button
          type="button"
          onClick={close}
          aria-label="Close notifications"
          className="flex h-6 shrink-0 items-start justify-center"
        >
          <span aria-hidden="true" className="h-1.5 w-10 rounded-pill bg-border-strong/40" />
        </button>
      ) : null}
    </div>
  );

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
          open
            ? "bg-accent-soft text-accent-light"
            : sheet
              ? "bg-card text-text hover:bg-hover"
              : "text-text-muted hover:bg-card hover:text-text"
        }`}
      >
        {/* The bell tips a little as its panel opens (from alerts option C). */}
        <span
          className={`flex transition-transform duration-[var(--duration-spring)] ease-[var(--ease-spring)] ${
            open ? "-rotate-[14deg]" : ""
          }`}
        >
          <BellIcon className="size-5" />
        </span>
        {unreadNow > 0 ? (
          sheet ? (
            <span
              aria-hidden="true"
              className="absolute top-2 right-2.5 size-2 rounded-pill bg-error ring-2 ring-card"
            />
          ) : (
            // The side bar shows how many (side bar B, G 2026-11-09); the name says it too.
            <span
              aria-hidden="true"
              className="tabular absolute top-0.5 right-0 flex h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-pill bg-error px-1 text-[0.625rem] leading-none font-bold text-on-accent ring-2 ring-surface"
            >
              {unreadNow > 99 ? "99+" : unreadNow}
            </span>
          )
        ) : null}
      </button>
      {open
        ? createPortal(
            <>
              {sheet ? (
                <div
                  ref={backdropRef}
                  aria-hidden="true"
                  className="notification-fade bg-black/40 fixed inset-x-0 top-[calc(3.5rem+1px+env(safe-area-inset-top))] bottom-0 z-40 print:hidden"
                />
              ) : null}
              {sheet ? (
                // Clipped just under the top bar, so the sheet pulls down from behind it.
                <div className="pointer-events-none fixed inset-x-0 top-[calc(3.5rem+1px+env(safe-area-inset-top))] bottom-0 z-50 overflow-hidden print:hidden">
                  <div className="notification-drop pointer-events-auto absolute inset-x-2 top-2">
                    {/* The point at the bell, so it's clear which button opened it. */}
                    <span
                      aria-hidden="true"
                      style={{ right: pointerRight }}
                      className="absolute -top-1.5 size-3 rotate-45 rounded-tl-[2px] border-t border-l border-border bg-surface"
                    />
                    {panel}
                  </div>
                </div>
              ) : (
                panel
              )}
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
