"use client";

import { useSyncExternalStore } from "react";
import { MoonIcon, SunIcon } from "@/components/ui/icons";
import {
  APPEARANCE_COOKIE,
  APPEARANCE_MAX_AGE,
  THEME_COLORS,
  type Appearance,
} from "@/lib/domain/appearance";

/** Tells every toggle on the page, such as the sidebar's two copies. */
const THEME_EVENT = "theme-change";

function subscribe(onChange: () => void) {
  window.addEventListener(THEME_EVENT, onChange);
  return () => window.removeEventListener(THEME_EVENT, onChange);
}

/** Applies a choice straight away and remembers it on this device. */
function apply(appearance: Appearance) {
  document.documentElement.dataset.theme = appearance;
  document.querySelector('meta[name="color-scheme"]')?.setAttribute("content", appearance);
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", THEME_COLORS[appearance]);
  const secure = window.location.protocol === "https:" ? "; secure" : "";
  document.cookie = `${APPEARANCE_COOKIE}=${appearance}; path=/; max-age=${APPEARANCE_MAX_AGE}; samesite=lax${secure}`;
  window.dispatchEvent(new Event(THEME_EVENT));
}

/**
 * Light or dark, as a sliding switch beside the person's name and on the sign-in page (G,
 * 2026-11-03). On a touch screen the area you can tap is 44px, around the smaller switch.
 */
export function ThemeToggle({ initial }: { initial: Appearance }) {
  const dark = useSyncExternalStore(
    subscribe,
    () => document.documentElement.dataset.theme === "dark",
    () => initial === "dark",
  );
  const Icon = dark ? MoonIcon : SunIcon;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      aria-label="Dark mode"
      title={dark ? "Switch to light" : "Switch to dark"}
      onClick={() => apply(dark ? "light" : "dark")}
      className="relative inline-flex h-7 w-[3.125rem] shrink-0 items-center rounded-pill border border-border-strong bg-card text-text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-light pointer-coarse:after:absolute pointer-coarse:after:-inset-2"
    >
      <SunIcon className="absolute left-1 size-3.5" />
      <MoonIcon className="absolute right-1 size-3.5" />
      <span
        aria-hidden="true"
        className={`absolute top-0.5 left-0.5 flex size-[1.375rem] items-center justify-center rounded-pill bg-accent text-on-accent transition-transform duration-[var(--duration-base)] ease-standard motion-reduce:transition-none ${
          dark ? "translate-x-[1.375rem]" : ""
        }`}
      >
        <Icon className="size-3.5" />
      </span>
    </button>
  );
}
