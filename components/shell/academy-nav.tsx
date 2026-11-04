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
} from "@/components/ui/icons";

/** The learner destinations (DESIGN §3.1), shared by the side bar and the phone tab bar. */
const LINKS: {
  href: string;
  label: string;
  icon: (props: { className?: string }) => ReactNode;
  /** Phones have four tabs; All courses is a link on Training there. */
  sideBarOnly?: boolean;
}[] = [
  { href: "/home", label: "Training", icon: GraduationCapIcon },
  { href: "/courses", label: "All courses", icon: BookOpenIcon, sideBarOnly: true },
  { href: "/schedule", label: "Schedule", icon: CalendarRangeIcon },
  { href: "/serve", label: "Checklist", icon: ListChecksIcon },
  { href: "/sops", label: "SOPs", icon: FileTextIcon },
];

function isCurrent(pathname: string, href: string): boolean {
  // A course's own page isn't "All courses": someone may have come from Training.
  if (href === "/courses") {
    return pathname === href;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** One link in the side bar. Its fill and weight mark the current page, not colour alone. */
export function AcademyNavLink({
  href,
  label,
  icon: Icon = DashboardIcon,
}: {
  href: string;
  label: string;
  icon?: (props: { className?: string }) => ReactNode;
}) {
  const current = isCurrent(usePathname(), href);
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={`flex min-h-touch items-center gap-2.5 rounded-button px-2.5 text-small transition-surface ${
        current
          ? "bg-accent-soft font-semibold text-accent-light"
          : "text-text-secondary hover:bg-hover hover:text-text"
      }`}
    >
      <Icon className="size-4 shrink-0" />
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
      <ul className="flex flex-col gap-1">
        {LINKS.map((link) => (
          <li key={link.href}>
            <AcademyNavLink href={link.href} label={link.label} icon={link.icon} />
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
  return (
    <nav
      aria-label="Academy"
      className="sticky bottom-0 z-30 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden print:hidden"
    >
      <ul className="grid grid-cols-4">
        {LINKS.filter((link) => !link.sideBarOnly).map((link) => {
          const current = isCurrent(pathname, link.href);
          const Icon = link.icon;
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                aria-current={current ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-1 text-small transition-surface ${
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
