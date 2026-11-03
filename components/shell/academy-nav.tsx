"use client";

import { useCallback, useEffect, useRef, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarRangeIcon,
  FileTextIcon,
  GraduationCapIcon,
  ListChecksIcon,
} from "@/components/ui/icons";
import { navMarkerPosition } from "@/lib/domain/nav-marker";

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

/** One link in the header nav, marking the current page with an underline as well as weight. */
export function AcademyNavLink({ href, label }: { href: string; label: string }) {
  const current = isCurrent(usePathname(), href);
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={`relative flex min-h-touch items-center rounded-button px-3 text-small whitespace-nowrap transition-surface hover:text-text focus-visible:text-text ${
        current
          ? // This underline shows until the sliding one below takes over from it.
            "font-medium text-text after:absolute after:inset-x-3 after:bottom-1.5 after:h-0.5 after:rounded-pill after:bg-accent group-data-[ready=true]/nav:after:opacity-0"
          : "text-text-secondary"
      }`}
    >
      {label}
    </Link>
  );
}

/**
 * Learner navigation in the header (DESIGN §3.1). From 640px; phones use the tab bar instead. In
 * the admin workspace it shows that context. `extra` adds links the server decides on.
 */
export function AcademyNav({ extra }: { extra?: ReactNode }) {
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

  return <HeaderLinks pathname={pathname} extra={extra} />;
}

/**
 * The header's links, and one purple underline that glides to whichever link has the mouse or
 * keyboard focus, then back to the current page (G's pick, 2026-11-03). It's written straight to
 * the page, so moving it never re-renders the header.
 */
function HeaderLinks({ pathname, extra }: { pathname: string; extra?: ReactNode }) {
  const list = useRef<HTMLUListElement>(null);
  const marker = useRef<HTMLLIElement>(null);

  const moveTo = useCallback((link: Element | null | undefined) => {
    if (!marker.current || !list.current) {
      return;
    }
    if (!link) {
      // A page that isn't in the header, such as your profile: nothing to rest on.
      marker.current.style.opacity = "0";
      return;
    }
    const { x, width } = navMarkerPosition(
      link.getBoundingClientRect(),
      list.current.getBoundingClientRect(),
    );
    marker.current.style.width = `${width}px`;
    marker.current.style.transform = `translateX(${x}px)`;
    marker.current.style.opacity = "1";
  }, []);
  const rest = useCallback(() => {
    moveTo(list.current?.querySelector('a[aria-current="page"]'));
  }, [moveTo]);
  const follow = (event: { target: EventTarget | null }) => {
    if (event.target instanceof Element) {
      const link = event.target.closest("a");
      if (link) {
        moveTo(link);
      }
    }
  };

  useEffect(() => {
    rest();
    // Turned on after the first placement, so it doesn't slide in from the left when the page opens.
    const frame = requestAnimationFrame(() => {
      if (list.current) {
        list.current.dataset.ready = "true";
      }
    });
    let cancelled = false;
    void document.fonts?.ready.then(() => {
      if (!cancelled) {
        rest();
      }
    });
    window.addEventListener("resize", rest);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", rest);
    };
  }, [pathname, rest]);

  return (
    <nav aria-label="Academy" className="hidden min-w-0 sm:block">
      <ul
        ref={list}
        onMouseOver={follow}
        onMouseLeave={rest}
        onFocus={follow}
        onBlur={rest}
        className="group/nav relative flex items-center gap-1"
      >
        {LINKS.map((link) => (
          <li key={link.href}>
            <AcademyNavLink href={link.href} label={link.label} />
          </li>
        ))}
        {extra}
        <li
          ref={marker}
          aria-hidden="true"
          data-testid="nav-marker"
          className="pointer-events-none absolute bottom-1.5 left-0 h-0.5 rounded-pill bg-accent opacity-0 duration-[var(--duration-base)] ease-[var(--ease-standard)] group-data-[ready=true]/nav:transition-[transform,width,opacity] motion-reduce:transition-none!"
        />
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
