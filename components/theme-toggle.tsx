"use client";

import { useSyncExternalStore } from "react";
import { MoonIcon, SunIcon } from "@/components/ui/icons";
import {
  APPEARANCE_COOKIE,
  APPEARANCE_MAX_AGE,
  THEME_COLORS,
  type Appearance,
} from "@/lib/domain/appearance";

/** Tells every toggle on the page, such as the phone bar's and the side bar's copies. */
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
 * Light or dark in one tap: a round button showing the moon in dark and the sun in light (G,
 * 2026-11-06, replacing the sliding switch). Still a switch to assistive technology.
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
      className="relative flex size-10 shrink-0 items-center justify-center rounded-pill bg-card text-text transition-surface hover:bg-hover pointer-coarse:after:absolute pointer-coarse:after:-inset-0.5"
    >
      <Icon className="size-5" />
    </button>
  );
}
