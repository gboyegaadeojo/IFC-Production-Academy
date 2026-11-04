import Link from "next/link";

/**
 * Courses and Explore share one tab on phones, so this switches between them (G, 2026-11-04).
 * From 768px the side bar has both.
 */
export function LibrarySwitch({ current }: { current: "courses" | "explore" }) {
  const links = [
    { key: "courses", href: "/courses", label: "Courses" },
    { key: "explore", href: "/explore", label: "Explore" },
  ] as const;
  return (
    <nav
      aria-label="Library"
      className="grid grid-cols-2 overflow-hidden rounded-button border border-border-strong md:hidden"
    >
      {links.map((link) => (
        <Link
          key={link.key}
          href={link.href}
          aria-current={current === link.key ? "page" : undefined}
          className="flex min-h-touch items-center justify-center font-medium text-text-secondary transition-surface aria-[current=page]:bg-accent-soft aria-[current=page]:font-semibold aria-[current=page]:text-accent-light"
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
