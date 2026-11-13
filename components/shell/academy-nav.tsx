"use client";

import { type ReactNode, useId, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpenIcon,
  CalendarRangeIcon,
  ChevronLeftIcon,
  ClipboardIcon,
  DashboardIcon,
  FileTextIcon,
  GraduationCapIcon,
  ListChecksIcon,
  MessageIcon,
  PlayCircleIcon,
} from "@/components/ui/icons";
import { ACADEMY_SIDEBAR_COOKIE } from "@/lib/domain/appearance";
import { MessagesBadge } from "./messages-badge";
import { ServeSheet } from "./serve-sheet";
import { tabClasses, tabIconClasses } from "./tab-styles";

type NavLink = {
  href: string;
  label: string;
  icon: (props: { className?: string }) => ReactNode;
};

const TRAINING: NavLink = { href: "/home", label: "Training", icon: GraduationCapIcon };
const COURSES: NavLink = { href: "/courses", label: "Courses", icon: BookOpenIcon };
const SCHEDULE: NavLink = { href: "/schedule", label: "Schedule", icon: CalendarRangeIcon };
const CHECKLIST: NavLink = { href: "/serve", label: "Checklist", icon: ListChecksIcon };
const SOPS: NavLink = { href: "/sops", label: "SOPs", icon: FileTextIcon };

/** The side bar's sections (side bar B, G 2026-11-09). Messages and the dashboard come from the server. */
const LEARN: NavLink[] = [COURSES, { href: "/explore", label: "Explore", icon: PlayCircleIcon }];
const SERVE: NavLink[] = [SCHEDULE, CHECKLIST, SOPS];

/** Phones have five tabs (G, 2026-11-04). Explore is a switch at the top of Courses there. */
const TAB_LINKS: NavLink[] = [TRAINING, COURSES, SCHEDULE, CHECKLIST, SOPS];

/**
 * With messaging on (G, 2026-11-08): Messages in the middle, and Checklist and SOPs together as
 * Serve, which opens the checklist and is current on either.
 */
const MESSAGE_TAB_LINKS: NavLink[] = [
  TRAINING,
  COURSES,
  { href: "/messages", label: "Messages", icon: MessageIcon },
  SCHEDULE,
  { href: "/serve", label: "Serve", icon: ClipboardIcon },
];

function isCurrent(pathname: string, href: string): boolean {
  // A course's own page isn't the Courses list: someone may have come from Training.
  if (href === "/courses") {
    return pathname === href;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Classes for a folded side bar (icons only), set by data-folded on the side bar itself. */
const FOLDED_HIDE = "group-data-[folded=true]/sidebar:sr-only";

/**
 * One link in the side bar: the icon and its name, in 11px type (side bar B, G 2026-11-09; 2px larger, 2026-11-10). Folded,
 * only the icon shows and the name is its tooltip. The tinted row and the weight mark the current
 * page, not colour alone.
 */
export function AcademyNavLink({
  href,
  label,
  icon = <DashboardIcon className="size-5" />,
  badge,
}: {
  href: string;
  label: string;
  /** Rendered already, so a server component can pass one in. */
  icon?: ReactNode;
  /** A count, such as unread messages: after the name, or over the icon when folded. */
  badge?: ReactNode;
}) {
  const current = isCurrent(usePathname(), href);
  return (
    <Link
      href={href}
      title={label}
      aria-current={current ? "page" : undefined}
      className={`relative flex min-h-7 items-center gap-2.5 rounded-button px-2.5 text-[0.6875rem] leading-tight transition-surface group-data-[folded=true]/sidebar:justify-center group-data-[folded=true]/sidebar:px-0 pointer-coarse:min-h-11 ${
        current
          ? "bg-accent-soft font-semibold text-text"
          : "font-medium text-text-secondary hover:bg-card hover:text-text"
      }`}
    >
      <span
        className={`flex shrink-0 [&_svg]:size-[1.125rem] ${current ? "text-accent-light" : "text-text-muted"}`}
      >
        {icon}
      </span>
      <span className={`min-w-0 flex-1 truncate ${FOLDED_HIDE}`}>{label}</span>
      {badge}
    </Link>
  );
}

function Section({ heading, children }: { heading: string; children: ReactNode }) {
  const id = useId();
  return (
    <div role="group" aria-labelledby={id} className="flex flex-col">
      <div
        aria-hidden="true"
        className="mx-2 my-2.5 hidden h-px bg-border group-data-[folded=true]/sidebar:block"
      />
      <p
        id={id}
        className={`px-2.5 pt-3 pb-1.5 text-[0.625rem] font-semibold tracking-[0.04em] text-text-muted uppercase ${FOLDED_HIDE}`}
      >
        {heading}
      </p>
      <ul className="flex flex-col gap-0.5">{children}</ul>
    </div>
  );
}

function NavItem({ link }: { link: NavLink }) {
  return (
    <li>
      <AcademyNavLink href={link.href} label={link.label} icon={<link.icon className="size-5" />} />
    </li>
  );
}

/**
 * Learner navigation in the side bar (DESIGN §3.1; side bar B, G 2026-11-09): Training and
 * Messages, then Learn and Serve. From 768px; phones use the tab bar instead. `messages` and
 * `extra` (the Service Dashboard) are links the server decides on.
 */
export function AcademyNav({ extra, messages }: { extra?: ReactNode; messages?: ReactNode }) {
  return (
    <nav aria-label="Academy" className="flex flex-col">
      <ul className="flex flex-col gap-0.5">
        <NavItem link={TRAINING} />
        {messages}
      </ul>
      <Section heading="Learn">
        {LEARN.map((link) => (
          <NavItem key={link.href} link={link} />
        ))}
      </Section>
      <Section heading="Serve">
        {SERVE.map((link) => (
          <NavItem key={link.href} link={link} />
        ))}
        {extra}
      </Section>
    </nav>
  );
}

/**
 * Folds the side bar to icons and back, remembered on this device. The side bar starts the way
 * the cookie says (no jump on load), and this flips data-folded on it. A round tab on the side
 * bar's edge (fold option A, G 2026-11-10): it shows when you point at the side bar or reach it by
 * keyboard, and stays while folded or on a touch screen, where there's no pointing.
 */
export function SidebarFoldButton({ initialFolded }: { initialFolded: boolean }) {
  const [folded, setFolded] = useState(initialFolded);
  const ref = useRef<HTMLButtonElement>(null);
  const toggle = () => {
    const next = !folded;
    setFolded(next);
    const sidebar = ref.current?.closest<HTMLElement>("[data-folded]");
    if (sidebar) {
      sidebar.dataset.folded = String(next);
    }
    document.cookie = `${ACADEMY_SIDEBAR_COOKIE}=${next ? "folded" : "open"}; path=/; max-age=${60 * 60 * 24 * 400}; samesite=lax`;
  };
  return (
    <button
      ref={ref}
      type="button"
      onClick={toggle}
      aria-pressed={folded}
      title={folded ? "Show names" : "Icons only"}
      className="absolute top-[3.75rem] -right-3.5 z-10 flex size-7 items-center justify-center rounded-pill border border-border bg-surface text-text-secondary opacity-0 shadow-[0_2px_8px_rgb(22_20_31/0.12)] transition-[opacity,background-color,color] duration-[var(--duration-fast)] group-hover/sidebar:opacity-100 group-data-[folded=true]/sidebar:opacity-100 hover:bg-hover hover:text-text focus-visible:opacity-100 pointer-coarse:opacity-100 pointer-coarse:after:absolute pointer-coarse:after:-inset-2"
    >
      <ChevronLeftIcon
        className={`size-3.5 transition-transform duration-[var(--duration-base)] ease-standard ${folded ? "rotate-180" : ""}`}
      />
      <span className="sr-only">Icons only</span>
    </button>
  );
}

/** Copyright on a phone, for reviewers only, with how many wait for them (ADD-COPY-05). */
export type CopyrightTab = { waiting: number };

/**
 * Phone tab bar (DESIGN §3; phone bar A, G 2026-11-09): it floats with a gap beneath it, and a
 * soft pill springs across to the tab you tap. Below 768px only, never in the admin workspace, and
 * not on lessons or in a chat.
 */
export function AcademyTabBar({
  messages,
  copyright = null,
}: {
  messages?: { unread: number } | null;
  copyright?: CopyrightTab | null;
}) {
  const pathname = usePathname();
  // Lessons have their own bottom bar (back, Mark complete, next), and an open chat has its
  // message box, so the tab bar steps aside.
  if (
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    /^\/courses\/[^/]+\/lessons\//.test(pathname) ||
    pathname.startsWith("/messages/")
  ) {
    return null;
  }
  // Fixed, not sticky: a sticky bar is part of the page, so iPhone's bounce at the top or bottom
  // drags it along. The spacer keeps the page's last lines clear of it.
  return (
    <>
      <div aria-hidden="true" className="h-(--tab-bar-space) shrink-0 md:hidden print:hidden" />
      <nav
        aria-label="Academy"
        className="fixed inset-x-3 bottom-(--tab-bar-gap) z-30 rounded-[1.375rem] border border-border bg-surface p-1.5 shadow-[0_10px_30px_rgb(22_20_31/0.12),0_2px_6px_rgb(22_20_31/0.06)] md:hidden print:hidden"
      >
        <TabList pathname={pathname} messages={messages ?? null} copyright={copyright} />
      </nav>
    </>
  );
}

/** The pages under Serve on a phone, when Serve is one tab (option A, G 2026-11-13). */
const SERVE_SHEET_PATHS = ["/serve", "/sops", "/copyright"];

function TabList({
  pathname,
  messages,
  copyright,
}: {
  pathname: string;
  messages: { unread: number } | null;
  copyright: CopyrightTab | null;
}) {
  const links = messages ? MESSAGE_TAB_LINKS : TAB_LINKS;
  // Explore sits inside the Courses tab on phones, and SOPs and Copyright inside Serve.
  const currentFlags = links.map(
    (link) =>
      isCurrent(pathname, link.href) ||
      (link.href === "/courses" && pathname === "/explore") ||
      (messages !== null &&
        link.href === "/serve" &&
        SERVE_SHEET_PATHS.some((path) => isCurrent(pathname, path))),
  );
  const currentIndex = currentFlags.indexOf(true);
  // Where the pill came from, so its front edge can lead the way (motion A, G 2026-11-13).
  const [move, setMove] = useState({ index: currentIndex, from: currentIndex });
  if (move.index !== currentIndex) {
    setMove({ index: currentIndex, from: move.index });
  }
  // On a page that isn't a tab, the pill fades where it was.
  const shown = currentIndex >= 0 ? currentIndex : Math.max(move.from, 0);
  const share = 100 / links.length;
  return (
    <div className="relative">
      {/* One solid pill under the current tab, stretching as it moves; hidden off the tabs. */}
      <span
        aria-hidden="true"
        data-moving={move.from >= 0 && currentIndex > move.from ? "right" : "left"}
        className={`tab-pill absolute inset-y-0.5 rounded-2xl ${currentIndex < 0 ? "opacity-0" : ""}`}
        style={{
          left: `calc(${shown * share}% + 2px)`,
          right: `calc(${(links.length - 1 - shown) * share}% + 2px)`,
        }}
      />
      <ul className="relative grid grid-cols-5">
        {links.map((link, index) => {
          const current = currentFlags[index];
          const Icon = link.icon;
          if (messages && link.href === "/serve") {
            return (
              <li key={link.href}>
                <ServeSheet current={current === true} copyright={copyright} />
              </li>
            );
          }
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                aria-current={current ? "page" : undefined}
                className={tabClasses(current === true)}
              >
                <span className={tabIconClasses(current === true)}>
                  <Icon className="size-[1.375rem]" />
                </span>
                {link.label}
                {messages && link.href === "/messages" ? (
                  <MessagesBadge
                    initial={messages.unread}
                    className="absolute top-0.5 left-[calc(50%+0.25rem)] ring-2 ring-surface"
                  />
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
