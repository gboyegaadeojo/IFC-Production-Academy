"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { helpHrefFor } from "@/lib/domain/help";
import { HELP_ADMIN_PATHS } from "@/lib/domain/admin";
import { useEffect, useId, useRef, useState } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { ReportProblemDialog } from "./report-problem";
import type { Appearance } from "@/lib/domain/appearance";
import {
  AlertTriangleIcon,
  BellIcon,
  ChevronRightIcon,
  LogOutIcon,
  ShieldIcon,
  SmartphoneIcon,
  InfoIcon,
  UsersIcon,
} from "@/components/ui/icons";

/**
 * Account menu (DESIGN §3.2; mock 5, approved 2026-11-06): your name at the top opens your profile,
 * then Mentoring, Admin when permitted, Get the app, Help, Report a problem, and Sign out. The bell beside the button
 * has notifications, except in Admin, which has no bell, so the menu lists them there. A disclosure,
 * not an ARIA menu: Tab moves through the links, Escape closes and returns focus to the button, and
 * a click outside closes it.
 */
export function AccountMenu({
  displayName,
  initials,
  showAdmin,
  unread = 0,
  placement = "header",
  compact = false,
  appearance,
}: {
  displayName: string;
  initials: string;
  showAdmin: boolean;
  /** Unread notifications. Only Admin passes it, since it has no bell. */
  unread?: number;
  /**
   * The phone bar (initials only), the learner side bar (your name beside the initials, opening
   * upwards, or sideways when the side bar is folded), or the admin sidebar's footer (opening
   * upwards, or sideways when it's icons only).
   */
  placement?: "header" | "rail" | "sidebar";
  /** Icons-only admin sidebar: just the avatar. */
  compact?: boolean;
  /** Given where the menu holds the light or dark switch (the learner side bar). */
  appearance?: Appearance;
}) {
  const inSidebar = placement === "sidebar";
  const inRail = placement === "rail";
  const pathname = usePathname();
  // Open only on the page where it was opened, so navigating anywhere closes it.
  const [openedOn, setOpenedOn] = useState<string | null>(null);
  const open = openedOn === pathname;
  const setOpen = (value: boolean) => setOpenedOn(value ? pathname : null);
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const inAdmin = pathname === "/admin" || pathname.startsWith("/admin/");
  const [reporting, setReporting] = useState(false);

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
  const avatarBase =
    "flex shrink-0 items-center justify-center rounded-pill border border-border-strong bg-[linear-gradient(135deg,color-mix(in_srgb,var(--accent)_22%,var(--card)),var(--card))] font-medium text-text";
  const avatar = `${avatarBase} size-8 text-small`;

  return (
    <div
      ref={rootRef}
      className={
        inRail ? "relative min-w-0 flex-1 group-data-[folded=true]/sidebar:flex-none" : "relative"
      }
    >
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(!open)}
        title={inSidebar || inRail ? displayName : undefined}
        className={
          inSidebar
            ? `flex min-h-11 items-center gap-2 rounded-button text-left text-text-secondary transition-surface hover:bg-card hover:text-text ${
                compact ? "relative w-11 justify-center" : "w-full px-2"
              }`
            : inRail
              ? "flex w-full min-w-0 items-center gap-2 rounded-button p-1 text-left text-text transition-surface group-data-[folded=true]/sidebar:justify-center hover:bg-card"
              : "flex min-h-touch items-center rounded-pill text-text"
        }
      >
        <span
          aria-hidden="true"
          className={
            inSidebar
              ? avatar
              : inRail
                ? `${avatarBase} size-9 text-small`
                : `${avatarBase} size-10 text-body`
          }
        >
          {initials}
        </span>
        {/* Your name beside the initials in the side bar; the whole name is always in the label. */}
        {inRail ? (
          <span
            aria-hidden="true"
            className="flex min-w-0 flex-1 flex-col text-[0.625rem] leading-snug group-data-[folded=true]/sidebar:hidden"
          >
            <span className="truncate font-semibold">{displayName}</span>
            <span className="truncate text-text-muted">Settings, sign out</span>
          </span>
        ) : null}
        <span
          className={
            inSidebar && !compact
              ? "min-w-0 flex-1 truncate text-small font-medium text-text"
              : "sr-only"
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
      </button>
      {open ? (
        <div
          id={panelId}
          className={`absolute z-40 w-[18.75rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-card border border-border bg-surface shadow-[0_24px_60px_-20px_var(--bg)] ${
            inSidebar
              ? compact
                ? "bottom-0 left-full ml-3"
                : "bottom-full left-0 mb-2"
              : inRail
                ? "bottom-full left-0 mb-2 group-data-[folded=true]/sidebar:bottom-0 group-data-[folded=true]/sidebar:left-full group-data-[folded=true]/sidebar:mb-0 group-data-[folded=true]/sidebar:ml-3"
                : "right-0 mt-2"
          }`}
        >
          <Link
            href="/profile"
            className="flex items-center gap-3 border-b border-border p-4 transition-surface hover:bg-card"
          >
            <span aria-hidden="true" className={`${avatarBase} size-11 text-body`}>
              {initials}
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-semibold text-text">{displayName}</span>
              <span className="text-small text-text-muted">View your profile</span>
            </span>
            <ChevronRightIcon className="size-4 shrink-0 text-text-muted" />
          </Link>
          <ul className="flex flex-col p-1.5">
            {appearance ? (
              <li className="flex min-h-touch items-center justify-between gap-3 pr-1 pl-2.5 text-body text-text-secondary">
                <span aria-hidden="true">Dark mode</span>
                <ThemeToggle initial={appearance} />
              </li>
            ) : null}
            {inAdmin ? (
              <li>
                <Link href="/notifications" className={item}>
                  <BellIcon className="size-[18px] shrink-0" />
                  Notifications
                  {unread > 0 ? (
                    <span className="tabular ml-auto rounded-pill bg-accent px-2 text-small text-on-accent">
                      {unread > 99 ? "99+" : unread}
                      <span className="sr-only"> unread</span>
                    </span>
                  ) : null}
                </Link>
              </li>
            ) : null}
            <li>
              <Link href="/get-the-app" className={item}>
                <SmartphoneIcon className="size-[18px] shrink-0" />
                Get the app
              </Link>
            </li>
            <li>
              <Link href="/mentoring" className={item}>
                <UsersIcon className="size-[18px] shrink-0" />
                Mentoring
              </Link>
            </li>
            <li>
              <Link href={helpHrefFor(pathname, HELP_ADMIN_PATHS)} className={item}>
                <InfoIcon className="size-[18px] shrink-0" />
                Help
              </Link>
            </li>
            <li>
              <button
                type="button"
                aria-haspopup="dialog"
                onClick={() => {
                  setOpenedOn(null);
                  setReporting(true);
                }}
                className={`${item} w-full`}
              >
                <AlertTriangleIcon className="size-[18px] shrink-0" />
                Report a problem
              </button>
            </li>
            {/* The sidebar has its own workspace switcher. */}
            {/* Admin's own sidebar has the way back, so only there does the menu leave it out. */}
            {showAdmin && !(inSidebar && inAdmin) ? (
              <li>
                <Link href={inAdmin ? "/home" : "/admin"} className={item}>
                  <ShieldIcon className="size-[18px] shrink-0" />
                  {inAdmin ? "Back to Academy" : "Admin"}
                </Link>
              </li>
            ) : null}
          </ul>
          <div className="mx-1.5 border-t border-border py-1.5">
            {/* A plain post, not a server action: see app/auth/sign-out/route.ts. */}
            <form action="/auth/sign-out" method="post">
              <button type="submit" className={`${item} w-full`}>
                <LogOutIcon className="size-[18px] shrink-0" />
                Sign out
              </button>
            </form>
          </div>
        </div>
      ) : null}
      <ReportProblemDialog open={reporting} onClose={() => setReporting(false)} />
    </div>
  );
}
