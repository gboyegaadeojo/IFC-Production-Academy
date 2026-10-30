"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { AdminSection } from "@/lib/domain/admin";

export function AdminNav({ sections }: { sections: AdminSection[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Admin" className="flex flex-col gap-2">
      <p aria-hidden="true" className="hidden px-3 eyebrow md:block">
        Admin
      </p>
      <ul className="flex gap-1 overflow-x-auto border-b border-border md:flex-col md:overflow-visible md:border-b-0">
        {sections.map((section) => {
          const current = pathname === section.href || pathname.startsWith(`${section.href}/`);
          return (
            <li key={section.key} className="shrink-0">
              <Link
                href={section.href}
                aria-current={current ? "page" : undefined}
                className={`flex min-h-control items-center border-b-2 px-3 text-small md:border-b-0 md:border-l-2 ${
                  current
                    ? "border-accent font-medium text-text"
                    : "border-transparent text-text-secondary hover:text-text"
                }`}
              >
                {section.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
