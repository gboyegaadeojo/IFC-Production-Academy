"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeftIcon } from "@/components/ui/icons";
import type { AdminSection, AdminSectionGroup } from "@/lib/domain/admin";

export type AdminNavGroup = { group: AdminSectionGroup; sections: AdminSection[] };

function currentSection(groups: AdminNavGroup[], pathname: string): AdminSection | null {
  for (const entry of groups) {
    for (const section of entry.sections) {
      if (pathname === section.href || pathname.startsWith(`${section.href}/`)) {
        return section;
      }
    }
  }
  return null;
}

/**
 * Admin sidebar (DESIGN §3.2): grouped, capability-aware links from adminSections(). The active
 * item gets a surface highlight and a narrow purple indicator, plus aria-current.
 */
export function AdminNav({ groups }: { groups: AdminNavGroup[] }) {
  const pathname = usePathname();
  const active = currentSection(groups, pathname);

  return (
    <nav aria-label="Admin" className="flex flex-col gap-6">
      <Link
        href="/home"
        className="flex min-h-touch items-center gap-2 rounded-button px-3 text-small text-text-secondary transition-surface hover:bg-hover hover:text-text lg:min-h-control"
      >
        <ArrowLeftIcon className="size-4" />
        Back to Academy
      </Link>
      {groups.map((entry) => (
        <div key={entry.group} className="flex flex-col gap-1">
          <p className="px-3 pb-1 eyebrow">{entry.group}</p>
          <ul className="flex flex-col gap-0.5">
            {entry.sections.map((section) => {
              const current = active?.key === section.key;
              return (
                <li key={section.key}>
                  <Link
                    href={section.href}
                    aria-current={current ? "page" : undefined}
                    className={`relative flex min-h-touch items-center rounded-button px-3 text-body transition-surface lg:min-h-control ${
                      current
                        ? "bg-hover font-medium text-text before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-pill before:bg-accent"
                        : "text-text-secondary hover:bg-card hover:text-text"
                    }`}
                  >
                    {section.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** The current section's name, for the mobile admin bar. */
export function AdminCurrentLabel({ groups }: { groups: AdminNavGroup[] }) {
  const pathname = usePathname();
  return (
    <span className="truncate text-small font-medium text-text">
      {currentSection(groups, pathname)?.label ?? "Admin"}
    </span>
  );
}
