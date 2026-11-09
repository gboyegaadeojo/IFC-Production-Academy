"use client";

import { Fragment, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpenIcon,
  CalendarRangeIcon,
  ClipboardIcon,
  DashboardIcon,
  FileTextIcon,
  GraduationCapIcon,
  ListChecksIcon,
  MessageIcon,
  PlayCircleIcon,
} from "@/components/ui/icons";
import { MessagesBadge } from "./messages-badge";

type NavLink = {
  href: string;
  label: string;
  icon: (props: { className?: string }) => ReactNode;
};

/** The learner destinations (DESIGN §3.1), in the side bar's order. */
const NAV_LINKS: NavLink[] = [
  { href: "/home", label: "Training", icon: GraduationCapIcon },
  { href: "/courses", label: "Courses", icon: BookOpenIcon },
  { href: "/explore", label: "Explore", icon: PlayCircleIcon },
  { href: "/schedule", label: "Schedule", icon: CalendarRangeIcon },
  { href: "/serve", label: "Checklist", icon: ListChecksIcon },
  { href: "/sops", label: "SOPs", icon: FileTextIcon },
];

/** Phones have five tabs (G, 2026-11-04). Explore is a switch at the top of Courses there. */
const TAB_HREFS = new Set(["/home", "/courses", "/schedule", "/serve", "/sops"]);
const TAB_LINKS = NAV_LINKS.filter((link) => TAB_HREFS.has(link.href));

/**
 * With messaging on (G, 2026-11-08): Messages in the middle, and Checklist and SOPs together as
 * Serve, which opens the checklist and is current on either.
 */
const MESSAGE_TAB_LINKS: NavLink[] = [
  { href: "/home", label: "Training", icon: GraduationCapIcon },
  { href: "/courses", label: "Courses", icon: BookOpenIcon },
  { href: "/messages", label: "Messages", icon: MessageIcon },
  { href: "/schedule", label: "Schedule", icon: CalendarRangeIcon },
  { href: "/serve", label: "Serve", icon: ClipboardIcon },
];

function isCurrent(pathname: string, href: string): boolean {
  // A course's own page isn't the Courses list: someone may have come from Training.
  if (href === "/courses") {
    return pathname === href;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * One link in the side bar: the icon, with its name underneath in 10px type (mock 5; smaller at
 * G's request, 2026-11-06). The tinted pill and the weight mark the current page, not colour alone.
 */
export function AcademyNavLink({
  href,
  label,
  icon = <DashboardIcon className="size-5" />,
  badge,
}: {
  href: string;
  label: string;
  /** Rendered already, so a server component can pass one in. */
  icon?: ReactNode;
  /** A count over the icon, such as unread messages. */
  badge?: ReactNode;
}) {
  const current = isCurrent(usePathname(), href);
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={`group flex w-20 flex-col items-center gap-1 rounded-button py-1.5 text-center text-[0.625rem] leading-tight transition-surface [&_svg]:size-[1.125rem] ${
        current ? "font-semibold text-text" : "font-medium text-text-muted hover:text-text"
      }`}
    >
      <span
        className={`relative flex h-7 w-12 items-center justify-center rounded-pill transition-surface ${
          current ? "bg-accent-soft text-accent-light" : "group-hover:bg-card"
        }`}
      >
        {icon}
        {badge}
      </span>
      {label}
    </Link>
  );
}

/**
 * Learner navigation in the side bar (DESIGN §3.1). From 768px; phones use the tab bar instead.
 * `extra` adds links the server decides on; `messages` goes after Schedule (G, 2026-11-08).
 */
export function AcademyNav({ extra, messages }: { extra?: ReactNode; messages?: ReactNode }) {
  return (
    <nav aria-label="Academy">
      <ul className="flex flex-col items-center gap-1">
        {NAV_LINKS.map((link) => (
          <Fragment key={link.href}>
            <li>
              <AcademyNavLink
                href={link.href}
                label={link.label}
                icon={<link.icon className="size-5" />}
              />
            </li>
            {link.href === "/schedule" ? messages : null}
          </Fragment>
        ))}
        {extra}
      </ul>
    </nav>
  );
}

/**
 * Phone tab bar (DESIGN §3, "bottom navigation for 3–4 high-frequency learner destinations";
 * approved mock, 2026-11-01). Below 640px only, never in the admin workspace, and not on lessons.
 */
export function AcademyTabBar({ messages }: { messages?: { unread: number } | null }) {
  const pathname = usePathname();
  // Lessons have their own bottom bar (back, Mark complete, next), and an open chat has its
  // message box, so the tab bar steps aside.
  if (
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    /^\/courses\/[^/]+\/lessons\//.test(pathname) ||
    pathname.startsWith("/messages/")
  ) {
    return null;
  }
  // Fixed, not sticky: a sticky bar is part of the page, so iPhone's bounce at the top or bottom
  // drags it along. The spacer keeps the page's last lines clear of it.
  return (
    <>
      <div
        aria-hidden="true"
        className="h-[calc(3.5rem+1px+env(safe-area-inset-bottom))] shrink-0 md:hidden print:hidden"
      />
      <nav
        aria-label="Academy"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden print:hidden"
      >
        <TabList pathname={pathname} messages={messages ?? null} />
      </nav>
    </>
  );
}

function TabList({
  pathname,
  messages,
}: {
  pathname: string;
  messages: { unread: number } | null;
}) {
  return (
    <ul className="grid grid-cols-5">
      {(messages ? MESSAGE_TAB_LINKS : TAB_LINKS).map((link) => {
        // Explore sits inside the Courses tab on phones, and SOPs inside Serve.
        const current =
          isCurrent(pathname, link.href) ||
          (link.href === "/courses" && pathname === "/explore") ||
          (messages !== null && link.href === "/serve" && isCurrent(pathname, "/sops"));
        const Icon = link.icon;
        return (
          <li key={link.href}>
            <Link
              href={link.href}
              aria-current={current ? "page" : undefined}
              className={`flex min-h-14 flex-col items-center justify-center gap-1 text-[0.6875rem] transition-surface ${
                current ? "font-semibold text-text" : "font-medium text-text-muted hover:text-text"
              }`}
            >
              <span
                className={`relative flex h-7 w-13 items-center justify-center rounded-pill ${
                  current ? "bg-accent-soft text-accent-light" : ""
                }`}
              >
                <Icon className="size-5" />
                {messages && link.href === "/messages" ? (
                  <MessagesBadge initial={messages.unread} />
                ) : null}
              </span>
              {link.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
