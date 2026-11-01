"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarRangeIcon,
  FileTextIcon,
  GraduationCapIcon,
  ListChecksIcon,
} from "@/components/ui/icons";

/** The learner destinations (DESIGN §3.1), shared by the header and the phone tab bar. */
const LINKS: { href: string; label: string; icon: (props: { className?: string }) => ReactNode }[] =
  [
    { href: "/home", label: "Training", icon: GraduationCapIcon },
    { href: "/schedule", label: "Schedule", icon: CalendarRangeIcon },
    { href: "/serve", label: "Checklist", icon: ListChecksIcon },
    { href: "/sops", label: "SOPs", icon: FileTextIcon },
  ];

function isCurrent(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Learner navigation in the header (DESIGN §3.1). From 640px; phones use the tab bar instead. In
 * the admin workspace it shows that context.
 */
export function AcademyNav() {
  const pathname = usePathname();
  const inAdmin = pathname === "/admin" || pathname.startsWith("/admin/");

  if (inAdmin) {
    return (
      <p className="flex items-center gap-2 text-small text-text-muted">
        <span aria-hidden="true" className="text-border-strong">
          /
        </span>
        <span className="eyebrow text-text-secondary">Admin</span>
      </p>
    );
  }

  return (
    <nav aria-label="Academy" className="hidden min-w-0 sm:block">
      <ul className="flex items-center gap-1">
        {LINKS.map((link) => {
          const current = isCurrent(pathname, link.href);
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                aria-current={current ? "page" : undefined}
                className={`relative flex min-h-touch items-center rounded-button px-3 text-small whitespace-nowrap transition-surface hover:bg-card hover:text-text ${
                  current
                    ? "font-medium text-text after:absolute after:inset-x-3 after:bottom-1.5 after:h-0.5 after:rounded-pill after:bg-accent"
                    : "text-text-secondary"
                }`}
              >
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * Phone tab bar (DESIGN §3, "bottom navigation for 3–4 high-frequency learner destinations";
 * approved mock, 2026-11-01). Below 640px only, and never in the admin workspace.
 */
export function AcademyTabBar() {
  const pathname = usePathname();
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    return null;
  }
  return (
    <nav
      aria-label="Academy"
      className="sticky bottom-0 z-30 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] sm:hidden print:hidden"
    >
      <ul className="grid grid-cols-4">
        {LINKS.map((link) => {
          const current = isCurrent(pathname, link.href);
          const Icon = link.icon;
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                aria-current={current ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-1 text-[0.6875rem] transition-surface ${
                  current ? "font-medium text-text" : "text-text-muted hover:text-text"
                }`}
              >
                <Icon className={`size-5 ${current ? "text-accent-light" : ""}`} />
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
