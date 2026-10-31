"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Learner navigation (DESIGN §3.1). Only destinations that exist are listed: Explore and My
 * Learning join this list when their pages ship. In the admin workspace it shows that context.
 */
export function AcademyNav() {
  const pathname = usePathname();
  const inAdmin = pathname === "/admin" || pathname.startsWith("/admin/");
  const links = [
    { href: "/home", label: "Home" },
    { href: "/schedule", label: "Schedule" },
    { href: "/sops", label: "SOPs" },
  ];

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
    <nav aria-label="Academy" className="min-w-0 overflow-x-auto">
      <ul className="flex items-center sm:gap-1">
        {links.map((link) => {
          const current = pathname === link.href || pathname.startsWith(`${link.href}/`);
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                aria-current={current ? "page" : undefined}
                className={`relative flex min-h-touch items-center rounded-button px-2 text-small whitespace-nowrap transition-surface hover:text-text sm:px-3 ${
                  current
                    ? "font-medium text-text after:absolute after:inset-x-2 after:bottom-1.5 after:h-0.5 after:rounded-pill after:bg-accent sm:after:inset-x-3"
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
