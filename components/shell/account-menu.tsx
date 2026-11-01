"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { AppearancePicker } from "@/components/appearance-picker";
import { ChevronDownIcon } from "@/components/ui/icons";
import type { Appearance } from "@/lib/domain/appearance";

/**
 * Account menu (DESIGN §3.2): Profile, the Academy/Admin workspace switch when permitted,
 * Appearance (checklist app US-08a), and Sign out. A disclosure, not an ARIA menu: Tab moves through the links, Escape closes and returns
 * focus to the button, and a click outside closes it.
 */
export function AccountMenu({
  displayName,
  initials,
  showAdmin,
  unread = 0,
  appearance,
  signOut,
}: {
  displayName: string;
  initials: string;
  showAdmin: boolean;
  /** Unread notifications, shown on the button and the Notifications link. */
  unread?: number;
  /** This device's appearance. */
  appearance: Appearance;
  signOut: () => Promise<void>;
}) {
  const pathname = usePathname();
  // Open only on the page where it was opened, so navigating anywhere closes it.
  const [openedOn, setOpenedOn] = useState<string | null>(null);
  const open = openedOn === pathname;
  const setOpen = (value: boolean) => setOpenedOn(value ? pathname : null);
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const inAdmin = pathname === "/admin" || pathname.startsWith("/admin/");

  useEffect(() => {
    if (!open) {
      return;
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenedOn(null);
        buttonRef.current?.focus();
      }
    }
    function onPointer(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
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

  const item =
    "flex min-h-touch items-center rounded-button px-3 text-body text-text-secondary transition-surface hover:bg-hover hover:text-text";

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(!open)}
        className="flex min-h-touch items-center gap-2 rounded-button px-1.5 text-text-secondary transition-surface hover:bg-hover hover:text-text sm:px-2"
      >
        <span
          aria-hidden="true"
          className="flex size-8 items-center justify-center rounded-pill border border-border-strong bg-card text-small font-medium text-text"
        >
          {initials}
        </span>
        {/* Visible from 640px; always part of the name, so the label matches what's shown. */}
        <span className="sr-only text-small sm:not-sr-only sm:max-w-40 sm:truncate">
          {displayName}
        </span>
        {unread > 0 ? (
          <span
            aria-hidden="true"
            className="tabular rounded-pill bg-accent px-1.5 text-small font-medium text-on-accent"
          >
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
        <span className="sr-only">
          {unread > 0
            ? `, ${unread} unread ${unread === 1 ? "notification" : "notifications"}`
            : ""}
          , account menu
        </span>
        <ChevronDownIcon className="hidden size-4 sm:block" />
      </button>
      {open ? (
        <div
          id={panelId}
          className="absolute right-0 z-40 mt-2 w-64 rounded-card border border-border bg-surface p-2 shadow-[0_16px_40px_-12px_var(--bg)]"
        >
          <p className="truncate px-3 pt-1 pb-2 text-small text-text-muted">
            Signed in as <span className="text-text">{displayName}</span>
          </p>
          <ul className="flex flex-col">
            <li>
              <Link href="/profile" className={item}>
                Your profile
              </Link>
            </li>
            <li>
              <Link href="/notifications" className={`${item} justify-between`}>
                Notifications
                {unread > 0 ? (
                  <span className="tabular text-small text-text-muted">{unread} unread</span>
                ) : null}
              </Link>
            </li>
            <li>
              <Link href="/mentoring" className={item}>
                Mentoring
              </Link>
            </li>
            {showAdmin ? (
              <li>
                <Link href={inAdmin ? "/home" : "/admin"} className={item}>
                  {inAdmin ? "Back to Academy" : "Admin"}
                </Link>
              </li>
            ) : null}
          </ul>
          <div className="mt-2 border-t border-border px-1 pt-2 pb-1">
            <AppearancePicker initial={appearance} />
          </div>
          <div className="mt-2 border-t border-border pt-2">
            <form action={signOut}>
              <button type="submit" className={`${item} w-full`}>
                Sign out
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
