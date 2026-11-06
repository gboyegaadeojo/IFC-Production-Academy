"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpenIcon,
  CalendarRangeIcon,
  DashboardIcon,
  FileTextIcon,
  GraduationCapIcon,
  ListChecksIcon,
  PlayCircleIcon,
} from "@/components/ui/icons";

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
}: {
  href: string;
  label: string;
  /** Rendered already, so a server component can pass one in. */
  icon?: ReactNode;
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
        className={`flex h-7 w-12 items-center justify-center rounded-pill transition-surface ${
          current ? "bg-accent-soft text-accent-light" : "group-hover:bg-card"
        }`}
      >
        {icon}
      </span>
      {label}
    </Link>
  );
}

/**
 * Learner navigation in the side bar (DESIGN §3.1). From 768px; phones use the tab bar instead.
 * `extra` adds links the server decides on.
 */
export function AcademyNav({ extra }: { extra?: ReactNode }) {
  return (
    <nav aria-label="Academy">
      <ul className="flex flex-col items-center gap-1">
        {NAV_LINKS.map((link) => (
          <li key={link.href}>
            <AcademyNavLink
              href={link.href}
              label={link.label}
              icon={<link.icon className="size-5" />}
            />
          </li>
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
export function AcademyTabBar() {
  const pathname = usePathname();
  // Lessons have their own bottom bar (back, Mark complete, next), so the tab bar steps aside.
  if (
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    /^\/courses\/[^/]+\/lessons\//.test(pathname)
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
        <TabList pathname={pathname} />
      </nav>
    </>
  );
}

function TabList({ pathname }: { pathname: string }) {
  return (
    <ul className="grid grid-cols-5">
      {TAB_LINKS.map((link) => {
        // Explore sits inside the Courses tab on phones.
        const current =
          isCurrent(pathname, link.href) || (link.href === "/courses" && pathname === "/explore");
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
                className={`flex h-7 w-13 items-center justify-center rounded-pill ${
                  current ? "bg-accent-soft text-accent-light" : ""
                }`}
              >
                <Icon className="size-5" />
              </span>
              {link.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
