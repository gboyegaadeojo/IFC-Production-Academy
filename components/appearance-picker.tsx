"use client";

import { useId, useState } from "react";
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

/**
 * Dark, Light or System (checklist app US-08a): a compact row of three choices, in the account
 * menu and on the sign-in page. A radio group, so arrow keys move between the choices.
 */
export function AppearancePicker({ initial }: { initial: Appearance }) {
  const [value, setValue] = useState(initial);
  const name = useId();
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="px-1 text-small text-text-muted">Appearance</legend>
      <div className="grid grid-cols-3 gap-1 rounded-button border border-border p-1">
        {APPEARANCES.map((appearance) => (
          <label
            key={appearance}
            className="relative flex min-h-touch cursor-pointer items-center justify-center rounded-button px-2 text-small text-text-secondary transition-surface hover:text-text has-checked:bg-hover has-checked:font-medium has-checked:text-text has-checked:ring-1 has-checked:ring-border-strong has-focus-visible:outline-2 has-focus-visible:outline-accent-light lg:min-h-control"
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
            {APPEARANCE_LABELS[appearance]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
