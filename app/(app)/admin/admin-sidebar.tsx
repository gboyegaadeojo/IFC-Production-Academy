"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  type ComponentProps,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { IfcMark } from "@/components/brand";
import { AccountMenu } from "@/components/shell/account-menu";
import {
  CalendarRangeIcon,
  CheckIcon,
  ChevronRightIcon,
  ChevronUpDownIcon,
  DashboardIcon,
  GraduationCapIcon,
  HouseIcon,
  ListChecksIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  SettingsIcon,
  ShieldIcon,
  UsersIcon,
} from "@/components/ui/icons";
import {
  ADMIN_GROUP_ICONS,
  ADMIN_SIDEBAR_COOKIE,
  isCurrentSection,
  type AdminGroupIcon,
  type AdminSection,
  type AdminSectionGroup,
  type AdminSectionKey,
} from "@/lib/domain/admin";

export type AdminNavGroup = { group: AdminSectionGroup; sections: AdminSection[] };
export type AdminNavCounts = Partial<Record<AdminSectionKey, number>>;

const GROUP_ICONS: Record<AdminGroupIcon, (props: { className?: string }) => ReactNode> = {
  dashboard: DashboardIcon,
  "list-checks": ListChecksIcon,
  "calendar-range": CalendarRangeIcon,
  "graduation-cap": GraduationCapIcon,
  users: UsersIcon,
  settings: SettingsIcon,
};

/** Remembered on this device: which groups are open, and whether the sidebar is icons only. */
const OPEN_GROUPS_KEY = "admin-nav-open";

/** The most specific match, so /admin/checklists/activity is the Activity log, not Task lists. */
export function currentSection(groups: AdminNavGroup[], pathname: string): AdminSection | null {
  let best: AdminSection | null = null;
  for (const entry of groups) {
    for (const section of entry.sections) {
      if (
        isCurrentSection(section, pathname) &&
        (!best || section.href.length > best.href.length)
      ) {
        best = section;
      }
    }
  }
  return best;
}

// Open groups live in localStorage, read through useSyncExternalStore so the server render (no
// storage) and the browser agree; a change in one sidebar copy reaches the other.
const OPEN_GROUPS_EVENT = "admin-nav-open-change";

function subscribeOpenGroups(onChange: () => void) {
  window.addEventListener(OPEN_GROUPS_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(OPEN_GROUPS_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function storedOpenGroups(): string | null {
  try {
    return localStorage.getItem(OPEN_GROUPS_KEY);
  } catch {
    return null;
  }
}

function parseOpenGroups(value: string | null): string[] {
  try {
    const parsed: unknown = JSON.parse(value ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((g): g is string => typeof g === "string") : [];
  } catch {
    return [];
  }
}

function saveOpenGroups(groups: Iterable<string>) {
  try {
    localStorage.setItem(OPEN_GROUPS_KEY, JSON.stringify([...new Set(groups)]));
    window.dispatchEvent(new Event(OPEN_GROUPS_EVENT));
  } catch {
    // Private browsing: groups just don't stay open.
  }
}

const ROW =
  "relative flex min-h-10 w-full items-center gap-2.5 rounded-button px-2.5 text-left text-body transition-surface pointer-coarse:min-h-11 focus-visible:outline-2 focus-visible:outline-accent-light";
const ACTIVE =
  "bg-hover font-medium text-text before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-pill before:bg-accent";
const IDLE = "text-text-secondary hover:bg-card hover:text-text";

function CountBadge({ count, label }: { count: number | undefined; label: string }) {
  if (!count) {
    return null;
  }
  return (
    <span className="tabular ml-auto rounded-pill border border-border px-1.5 font-mono text-small text-text-secondary">
      {count}
      <span className="sr-only"> {label}</span>
    </span>
  );
}

function countLabel(key: AdminSectionKey): string {
  return key === "members" ? "waiting" : "to look at";
}

/**
 * Admin sidebar (DESIGN §3.2): the brand and an icons-only switch, the Administration and
 * Academy switcher, groups you can open and close (several at once, the current page's always
 * open, remembered on this device), real-count badges, and the account menu in a fixed footer.
 * Links come from adminNavigation(): only what the person may open. Each page still checks its own
 * capability on the server.
 */
export function AdminSidebar({
  groups,
  counts,
  account,
  initialCollapsed = false,
  variant = "rail",
}: {
  groups: AdminNavGroup[];
  counts: AdminNavCounts;
  account: Omit<ComponentProps<typeof AccountMenu>, "placement" | "compact">;
  initialCollapsed?: boolean;
  /** The persistent sidebar from 1024px, or its contents inside the mobile drawer. */
  variant?: "rail" | "drawer";
}) {
  const pathname = usePathname();
  const active = currentSection(groups, pathname);
  const activeGroup = groups.find((g) => g.sections.some((s) => s.key === active?.key))?.group;
  const [collapsed, setCollapsed] = useState(variant === "rail" && initialCollapsed);
  const stored = useSyncExternalStore(subscribeOpenGroups, storedOpenGroups, () => null);
  const storedGroups = parseOpenGroups(stored);
  // Before the browser has a list (and on the server), the current page's group is open.
  const open = new Set(stored === null && activeGroup ? [activeGroup] : storedGroups);
  const [flyout, setFlyout] = useState<{ group: AdminSectionGroup; top: number } | null>(null);
  // The rail and the drawer both render this, so ids are unique per copy.
  const idPrefix = useId();

  // The current page's group opens whenever you arrive in it.
  useEffect(() => {
    const current = parseOpenGroups(storedOpenGroups());
    if (activeGroup && !current.includes(activeGroup)) {
      saveOpenGroups([...current, activeGroup]);
    }
  }, [activeGroup]);

  const toggleGroup = (group: string) => {
    saveOpenGroups(
      open.has(group) ? storedGroups.filter((g) => g !== group) : [...storedGroups, group],
    );
  };

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    setFlyout(null);
    document.cookie = `${ADMIN_SIDEBAR_COOKIE}=${next ? "collapsed" : "expanded"}; path=/admin; max-age=${60 * 60 * 24 * 400}; samesite=lax`;
  };

  const compact = collapsed && variant === "rail";

  return (
    <div
      className={`flex h-full flex-col bg-surface ${
        variant === "rail"
          ? `transition-[width] duration-[var(--duration-base)] ease-standard ${compact ? "w-[72px]" : "w-64"}`
          : ""
      }`}
    >
      {variant === "rail" ? (
        <div
          className={`flex shrink-0 items-center gap-2 pt-4 pb-2 ${
            compact ? "flex-col px-0" : "justify-between pr-2 pl-4"
          }`}
        >
          <Link
            href="/admin"
            className="flex min-h-10 min-w-0 items-center gap-2.5 rounded-button"
            title="Admin dashboard"
          >
            <IfcMark className="mark-on-theme shrink-0" height={16} />
            {compact ? (
              <span className="sr-only">Production Academy admin</span>
            ) : (
              <span className="truncate text-body font-semibold tracking-tight text-text">
                Production <span className="font-medium text-text-secondary">Academy</span>
              </span>
            )}
          </Link>
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-pressed={compact}
            title={compact ? "Expand sidebar" : "Collapse sidebar"}
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-button text-text-muted transition-surface hover:bg-hover hover:text-text pointer-coarse:size-11"
          >
            {compact ? (
              <PanelLeftOpenIcon className="size-[18px]" />
            ) : (
              <PanelLeftCloseIcon className="size-[18px]" />
            )}
            <span className="sr-only">Icons only</span>
          </button>
        </div>
      ) : null}

      <WorkspaceSwitcher compact={compact} />
      <div className="mx-3 h-px shrink-0 bg-border" />

      <nav
        aria-label="Admin"
        className={`min-h-0 flex-1 overflow-y-auto py-3 ${compact ? "px-0" : "px-2"}`}
      >
        <ul className={`flex flex-col gap-0.5 ${compact ? "items-center" : ""}`}>
          {groups.map((entry) => {
            const Icon = GROUP_ICONS[ADMIN_GROUP_ICONS[entry.group]];
            const isActiveGroup = entry.group === activeGroup;
            // Overview holds only the dashboard: a plain link.
            if (entry.group === "Overview") {
              const section = entry.sections[0];
              if (!section) {
                return null;
              }
              const current = active?.key === section.key;
              return (
                <li key={entry.group} className={compact ? "" : "mb-1.5"}>
                  <Link
                    href={section.href}
                    aria-current={current ? "page" : undefined}
                    title={compact ? section.label : undefined}
                    className={`${ROW} ${compact ? "size-11 justify-center px-0" : ""} ${current ? ACTIVE : IDLE}`}
                  >
                    <Icon className="size-[18px] shrink-0" />
                    <span className={compact ? "sr-only" : "truncate"}>{section.label}</span>
                  </Link>
                </li>
              );
            }
            const listId = `${idPrefix}-${entry.group.replace(/\W+/g, "-").toLowerCase()}`;
            const hasCount = entry.sections.some((s) => counts[s.key]);
            if (compact) {
              return (
                <li key={entry.group}>
                  <button
                    type="button"
                    aria-haspopup="true"
                    aria-expanded={flyout?.group === entry.group}
                    onClick={(event) => {
                      const rect = event.currentTarget.getBoundingClientRect();
                      setFlyout(
                        flyout?.group === entry.group
                          ? null
                          : { group: entry.group, top: rect.top },
                      );
                    }}
                    onMouseEnter={(event) => {
                      setFlyout({
                        group: entry.group,
                        top: event.currentTarget.getBoundingClientRect().top,
                      });
                    }}
                    title={entry.group}
                    className={`${ROW} size-11 justify-center px-0 ${
                      isActiveGroup
                        ? "bg-hover text-text before:absolute before:inset-y-2.5 before:-left-3.5 before:w-0.5 before:rounded-pill before:bg-accent"
                        : IDLE
                    }`}
                  >
                    <Icon className="size-[18px]" />
                    <span className="sr-only">{entry.group}</span>
                    {hasCount ? (
                      <span
                        aria-hidden="true"
                        className="absolute top-2 right-2 size-1.5 rounded-pill bg-accent-light"
                      />
                    ) : null}
                  </button>
                </li>
              );
            }
            const expanded = open.has(entry.group);
            return (
              <li key={entry.group} className="flex flex-col">
                <button
                  type="button"
                  aria-expanded={expanded}
                  aria-controls={listId}
                  onClick={() => toggleGroup(entry.group)}
                  className={`${ROW} font-medium ${isActiveGroup ? "text-text" : "text-text-secondary hover:bg-card hover:text-text"}`}
                >
                  <Icon className="size-[18px] shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{entry.group}</span>
                  {!expanded && hasCount ? (
                    <span aria-hidden="true" className="size-1.5 rounded-pill bg-accent-light" />
                  ) : null}
                  <ChevronRightIcon
                    className={`size-4 shrink-0 text-text-muted transition-transform duration-[var(--duration-fast)] ease-standard ${expanded ? "rotate-90" : ""}`}
                  />
                </button>
                <ul
                  id={listId}
                  hidden={!expanded}
                  className="relative mt-0.5 mb-2 flex flex-col gap-0.5 pl-7"
                >
                  <span
                    aria-hidden="true"
                    className="absolute inset-y-1 left-[18px] w-px bg-border"
                  />
                  {entry.sections.map((section) => {
                    const current = active?.key === section.key;
                    return (
                      <li key={section.key}>
                        <Link
                          href={section.href}
                          aria-current={current ? "page" : undefined}
                          className={`${ROW} min-h-9 text-small ${current ? ACTIVE : IDLE}`}
                        >
                          <span className="min-w-0 flex-1 truncate">{section.label}</span>
                          <CountBadge count={counts[section.key]} label={countLabel(section.key)} />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </li>
            );
          })}
        </ul>
      </nav>

      {compact && flyout ? (
        <Flyout
          group={groups.find((g) => g.group === flyout.group)}
          top={flyout.top}
          activeKey={active?.key}
          counts={counts}
          onClose={() => setFlyout(null)}
        />
      ) : null}

      <div
        className={`shrink-0 border-t border-border py-2 ${compact ? "flex justify-center" : "px-2"}`}
      >
        <AccountMenu {...account} placement="sidebar" compact={compact} />
      </div>
    </div>
  );
}

/** Administration or the Academy, for people who may open Admin (only they see this sidebar). */
function WorkspaceSwitcher({ compact }: { compact: boolean }) {
  const [isOpen, setIsOpen] = useState(false);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();
  const [seenPath, setSeenPath] = useState(pathname);
  if (pathname !== seenPath) {
    setSeenPath(pathname);
    setIsOpen(false);
  }

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
        buttonRef.current?.focus();
      }
    }
    function onPointer(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [isOpen]);

  const item =
    "flex min-h-10 items-center gap-2.5 rounded-button px-2.5 text-small transition-surface hover:bg-hover hover:text-text";

  return (
    <div
      ref={rootRef}
      className={`relative shrink-0 pb-3 ${compact ? "flex justify-center pt-1" : "px-3 pt-1"}`}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={() => setIsOpen(!isOpen)}
        title={compact ? "Workspace: Administration" : undefined}
        className={`flex items-center gap-2.5 rounded-button border border-border bg-card text-left transition-surface hover:border-border-strong ${
          compact ? "size-11 justify-center" : "min-h-11 w-full px-2.5"
        }`}
      >
        <ShieldIcon className="size-[18px] shrink-0 text-text-secondary" />
        <span className={compact ? "sr-only" : "flex min-w-0 flex-1 flex-col leading-tight"}>
          <span className="eyebrow">Workspace</span>
          <span className="truncate text-small font-medium text-text">Administration</span>
        </span>
        {compact ? null : <ChevronUpDownIcon className="size-4 shrink-0 text-text-muted" />}
      </button>
      {isOpen ? (
        <div
          id={panelId}
          className={`absolute z-40 w-56 rounded-card border border-border bg-surface p-1.5 shadow-[0_16px_40px_-12px_var(--bg)] ${
            compact ? "top-1 left-full ml-2" : "inset-x-3 top-full -mt-1.5 w-auto"
          }`}
        >
          <ul className="flex flex-col">
            <li>
              <Link href="/admin" aria-current="true" className={`${item} text-text`}>
                <ShieldIcon className="size-4" />
                Administration
                <CheckIcon className="ml-auto size-4 text-accent-light" />
              </Link>
            </li>
            <li>
              <Link href="/home" className={`${item} text-text-secondary`}>
                <HouseIcon className="size-4" />
                Academy
              </Link>
            </li>
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Icons only: a group's pages beside its icon, on hover, focus or click. Escape closes it and
 * returns focus to the icon; so does moving the pointer away or choosing a page.
 */
function Flyout({
  group,
  top,
  activeKey,
  counts,
  onClose,
}: {
  group: AdminNavGroup | undefined;
  top: number;
  activeKey: AdminSectionKey | undefined;
  counts: AdminNavCounts;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => onClose(), [onClose]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        document
          .querySelector<HTMLElement>('[aria-haspopup="true"][aria-expanded="true"]')
          ?.focus();
        close();
      }
    }
    function onPointer(event: PointerEvent) {
      const target = event.target as HTMLElement;
      if (ref.current && !ref.current.contains(target) && !target.closest("[aria-haspopup]")) {
        close();
      }
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [close]);

  if (!group) {
    return null;
  }
  const headingId = `flyout-${group.group.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <div
      ref={ref}
      role="group"
      aria-labelledby={headingId}
      onMouseLeave={close}
      style={{ top: Math.max(8, top - 6) }}
      className="fixed left-[76px] z-50 w-60 rounded-card border border-border bg-surface p-1.5 shadow-[0_16px_40px_-12px_var(--bg)]"
    >
      <p id={headingId} className="px-2.5 pt-1.5 pb-1 eyebrow">
        {group.group}
      </p>
      <ul className="flex flex-col gap-0.5">
        {group.sections.map((section) => {
          const current = activeKey === section.key;
          return (
            <li key={section.key}>
              <Link
                href={section.href}
                onClick={close}
                aria-current={current ? "page" : undefined}
                className={`${ROW} min-h-9 text-small ${current ? ACTIVE : IDLE}`}
              >
                <span className="min-w-0 flex-1 truncate">{section.label}</span>
                <CountBadge count={counts[section.key]} label={countLabel(section.key)} />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** The current section's name, for the slim bar below 1024px. */
export function AdminCurrentLabel({ groups }: { groups: AdminNavGroup[] }) {
  const pathname = usePathname();
  return (
    <span className="truncate text-small font-medium text-text">
      {currentSection(groups, pathname)?.label ?? "Admin"}
    </span>
  );
}
