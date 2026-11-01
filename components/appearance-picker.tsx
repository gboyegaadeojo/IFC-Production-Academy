"use client";

import { type ReactNode, useId, useState } from "react";
import { MonitorIcon, MoonIcon, SunIcon } from "@/components/ui/icons";
import {
  APPEARANCE_COOKIE,
  APPEARANCE_LABELS,
  APPEARANCE_MAX_AGE,
  APPEARANCES,
  colorScheme,
  THEME_COLORS,
  type Appearance,
} from "@/lib/domain/appearance";

/** Applies a choice straight away and remembers it on this device. */
function apply(appearance: Appearance) {
  const root = document.documentElement;
  const theme =
    appearance === "system"
      ? window.matchMedia("(prefers-color-scheme: light)").matches
        ? "light"
        : "dark"
      : appearance;
  root.dataset.appearance = appearance;
  root.dataset.theme = theme;
  document
    .querySelector('meta[name="color-scheme"]')
    ?.setAttribute("content", colorScheme(appearance));
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLORS[theme]);
  const secure = window.location.protocol === "https:" ? "; secure" : "";
  document.cookie = `${APPEARANCE_COOKIE}=${appearance}; path=/; max-age=${APPEARANCE_MAX_AGE}; samesite=lax${secure}`;
}

const ICONS: Record<Appearance, (props: { className?: string }) => ReactNode> = {
  dark: MoonIcon,
  light: SunIcon,
  system: MonitorIcon,
};

/**
 * Dark, Light or System (checklist app US-08a): a compact row of three icons (moon, sun, screen),
 * in the account menu and on the sign-in page. A radio group, so arrow keys move between the
 * choices; each has its name for screen readers and as a tooltip.
 */
export function AppearancePicker({ initial }: { initial: Appearance }) {
  const [value, setValue] = useState(initial);
  const name = useId();
  return (
    <fieldset className="flex items-center justify-between gap-3">
      <legend className="float-left px-1 text-small text-text-muted">Appearance</legend>
      <div className="flex gap-1 rounded-pill border border-border p-1">
        {APPEARANCES.map((appearance) => {
          const Icon = ICONS[appearance];
          return (
            <label
              key={appearance}
              title={APPEARANCE_LABELS[appearance]}
              className="relative flex size-9 cursor-pointer items-center justify-center rounded-pill text-text-muted transition-surface hover:text-text has-checked:bg-hover has-checked:text-text has-checked:ring-1 has-checked:ring-border-strong has-focus-visible:outline-2 has-focus-visible:outline-accent-light pointer-coarse:size-11"
            >
              <input
                type="radio"
                name={name}
                value={appearance}
                checked={value === appearance}
                onChange={() => {
                  setValue(appearance);
                  apply(appearance);
                }}
                className="sr-only"
              />
              <Icon className="size-[18px]" />
              <span className="sr-only">{APPEARANCE_LABELS[appearance]}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
