"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { AppearancePicker } from "@/components/appearance-picker";
import {
  BellIcon,
  ChevronDownIcon,
  ChevronUpDownIcon,
  LogOutIcon,
  ShieldIcon,
  UserIcon,
  UsersIcon,
} from "@/components/ui/icons";
import type { Appearance } from "@/lib/domain/appearance";

/**
 * Account menu (DESIGN §3.2; approved mock, 2026-11-01): who you are and how you sign in, then
 * Profile, Notifications, Mentoring, the Academy/Admin workspace switch when permitted, Appearance
 * (checklist app US-08a), and Sign out. A disclosure, not an ARIA menu: Tab moves through the
 * links, Escape closes and returns focus to the button, and a click outside closes it.
 */
export function AccountMenu({
  displayName,
  initials,
  email = null,
  planningCenter = false,
  showAdmin,
  unread = 0,
  appearance,
  signOut,
  placement = "header",
  compact = false,
}: {
  displayName: string;
  initials: string;
  /** The sign-in email, shown under the name. */
  email?: string | null;
  /** Whether this account signs in with Planning Center. */
  planningCenter?: boolean;
  showAdmin: boolean;
  /** Unread notifications, shown on the button and the Notifications link. */
  unread?: number;
  /** This device's appearance. */
  appearance: Appearance;
  signOut: () => Promise<void>;
  /** In the admin sidebar's footer the menu opens upwards, or sideways when it's icons only. */
  placement?: "header" | "sidebar";
  /** Icons-only sidebar: just the avatar. */
  compact?: boolean;
}) {
  const inSidebar = placement === "sidebar";
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
    "flex min-h-touch items-center gap-3 rounded-button px-2.5 text-body text-text-secondary transition-surface hover:bg-card hover:text-text";
  const avatar =
    "flex size-8 shrink-0 items-center justify-center rounded-pill border border-border-strong bg-[linear-gradient(135deg,color-mix(in_srgb,var(--accent)_22%,var(--card)),var(--card))] text-small font-medium text-text";

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(!open)}
        title={compact ? displayName : undefined}
        className={
          inSidebar
            ? `flex min-h-11 items-center gap-2.5 rounded-button text-left text-text-secondary transition-surface hover:bg-card hover:text-text ${
                compact ? "relative w-11 justify-center" : "w-full px-2"
              }`
            : "flex min-h-touch items-center gap-2 rounded-button px-1.5 text-text-secondary transition-surface hover:bg-hover hover:text-text sm:px-2"
        }
      >
        <span aria-hidden="true" className={avatar}>
          {initials}
        </span>
        {/* Visible from 640px; always part of the name, so the label matches what's shown. */}
        <span
          className={
            inSidebar
              ? compact
                ? "sr-only"
                : "min-w-0 flex-1 truncate text-small font-medium text-text"
              : "sr-only text-small sm:not-sr-only sm:max-w-40 sm:truncate"
          }
        >
          {displayName}
        </span>
        {unread > 0 ? (
          compact ? (
            // Icons only: a dot on the avatar; the number is in the menu and the label.
            <span
              aria-hidden="true"
              className="absolute top-1.5 right-1.5 size-2 rounded-pill bg-accent ring-2 ring-surface"
            />
          ) : (
            <span
              aria-hidden="true"
              className="tabular rounded-pill bg-accent px-1.5 text-small font-medium text-on-accent"
            >
              {unread > 99 ? "99+" : unread}
            </span>
          )
        ) : null}
        <span className="sr-only">
          {unread > 0
            ? `, ${unread} unread ${unread === 1 ? "notification" : "notifications"}`
            : ""}
          , account menu
        </span>
        {inSidebar ? (
          compact ? null : (
            <ChevronUpDownIcon className="size-4 shrink-0 text-text-muted" />
          )
        ) : (
          <ChevronDownIcon className="hidden size-4 sm:block" />
        )}
      </button>
      {open ? (
        <div
          id={panelId}
          className={`absolute z-40 w-[18.75rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-card border border-border bg-surface shadow-[0_24px_60px_-20px_var(--bg)] ${
            inSidebar
              ? compact
                ? "bottom-0 left-full ml-3"
                : "bottom-full left-0 mb-2"
              : "right-0 mt-2"
          }`}
        >
          <div className="flex items-center gap-3 border-b border-border p-4">
            <span aria-hidden="true" className={avatar}>
              {initials}
            </span>
            <div className="flex min-w-0 flex-col">
              <span className="sr-only">Signed in as </span>
              <span className="truncate font-medium text-text">{displayName}</span>
              {email ? <span className="truncate text-small text-text-muted">{email}</span> : null}
              {planningCenter ? (
                <span className="mt-1.5 inline-flex w-fit items-center gap-1.5 rounded-pill border border-border px-2 py-0.5 text-[0.71875rem] text-text-secondary">
                  <span aria-hidden="true" className="size-1.5 rounded-pill bg-success" />
                  Signed in with Planning Center
                </span>
              ) : null}
            </div>
          </div>
          <ul className="flex flex-col p-1.5">
            <li>
              <Link href="/profile" className={item}>
                <UserIcon className="size-[18px] shrink-0" />
                Your profile
              </Link>
            </li>
            <li>
              <Link href="/notifications" className={item}>
                <BellIcon className="size-[18px] shrink-0" />
                Notifications
                {unread > 0 ? (
                  <span className="tabular ml-auto rounded-pill bg-accent px-2 font-mono text-[0.71875rem] text-on-accent">
                    {unread > 99 ? "99+" : unread}
                    <span className="sr-only"> unread</span>
                  </span>
                ) : null}
              </Link>
            </li>
            <li>
              <Link href="/mentoring" className={item}>
                <UsersIcon className="size-[18px] shrink-0" />
                Mentoring
              </Link>
            </li>
            {/* The sidebar has its own workspace switcher. */}
            {showAdmin && !inSidebar ? (
              <li>
                <Link href={inAdmin ? "/home" : "/admin"} className={item}>
                  <ShieldIcon className="size-[18px] shrink-0" />
                  {inAdmin ? "Back to Academy" : "Admin"}
                </Link>
              </li>
            ) : null}
          </ul>
          <div className="mx-1.5 border-t border-border px-2.5 py-2">
            <AppearancePicker initial={appearance} />
          </div>
          <div className="mx-1.5 border-t border-border py-1.5">
            <form action={signOut}>
              <button type="submit" className={`${item} w-full`}>
                <LogOutIcon className="size-[18px] shrink-0" />
                Sign out
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
