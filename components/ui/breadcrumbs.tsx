import Link from "next/link";
import { ChevronRightIcon } from "./icons";

export type Crumb = { label: string; href?: string };

/** Compact breadcrumbs for deep screens (DESIGN §3.3). The last crumb is the current page. */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-1 text-small text-text-muted">
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`} className="flex items-center gap-1">
              {item.href && !last ? (
                <Link
                  href={item.href}
                  className="rounded-button underline-offset-4 hover:text-text hover:underline"
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  aria-current={last ? "page" : undefined}
                  className={last ? "text-text-secondary" : ""}
                >
                  {item.label}
                </span>
              )}
              {last ? null : <ChevronRightIcon className="size-3.5" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
