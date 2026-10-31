import Link from "next/link";

export type TabLink = { href: string; label: string; current: boolean; count?: number };

/**
 * Section tabs as links (DESIGN §4.4 Tabs): each view has its own URL, works without JavaScript,
 * and marks the current one with aria-current plus an underline, never colour alone.
 */
export function Tabs({ label, tabs }: { label: string; tabs: TabLink[] }) {
  return (
    <nav aria-label={label} className="relative -mx-1 overflow-x-auto border-b border-border">
      <ul className="flex min-w-max gap-1 px-1">
        {tabs.map((tab) => (
          <li key={tab.href}>
            <Link
              href={tab.href}
              aria-current={tab.current ? "page" : undefined}
              className={`relative flex min-h-touch items-center gap-2 px-3 text-body transition-surface lg:min-h-11 ${
                tab.current
                  ? "font-medium text-text after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-pill after:bg-accent"
                  : "text-text-secondary hover:text-text"
              }`}
            >
              {tab.label}
              {tab.count !== undefined ? (
                <span className="tabular rounded-pill border border-border px-1.5 font-mono text-small text-text-muted">
                  {tab.count}
                </span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
