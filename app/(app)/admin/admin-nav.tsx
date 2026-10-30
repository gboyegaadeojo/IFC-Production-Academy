"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { AdminSection } from "@/lib/domain/admin";

export function AdminNav({ sections }: { sections: AdminSection[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Admin">
      <ul className="flex gap-2 overflow-x-auto md:flex-col md:overflow-visible">
        {sections.map((section) => {
          const current = pathname === section.href || pathname.startsWith(`${section.href}/`);
          return (
            <li key={section.key} className="shrink-0">
              <Link
                href={section.href}
                aria-current={current ? "page" : undefined}
                className={`flex min-h-11 items-center rounded-button px-4 text-small font-medium ${
                  current
                    ? "bg-hover text-text"
                    : "text-text-secondary hover:bg-hover hover:text-text"
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
