"use client";

import { type CSSProperties, useId, useState, useTransition } from "react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { fieldClasses } from "@/components/ui/field-classes";
import {
  adjustedShade,
  COLOUR_PRESETS,
  DEFAULT_COLOUR,
  isPreset,
  parseHex,
  PRESET_NAMES,
  PRESETS,
  previewVars,
  resolveColour,
} from "@/lib/domain/system-colour";
import { saveColourAction } from "./actions";

const CUSTOM = "custom";

/**
 * The system colour (G, 2026-11-13, as the approved mock): seven tested colours or your own, the
 * logo's dot on or off, and a preview of the light and dark themes side by side. Nothing changes
 * for anyone until Save.
 */
export function ColourForm({
  initialColour,
  initialLogo,
}: {
  initialColour: string;
  initialLogo: boolean;
}) {
  const startsCustom = !isPreset(initialColour);
  const [pick, setPick] = useState<string>(startsCustom ? CUSTOM : initialColour);
  const [hexText, setHexText] = useState(startsCustom ? initialColour.toUpperCase() : "#F59E0B");
  const [logo, setLogo] = useState(initialLogo);
  const [message, setMessage] = useState<{ text: string; failed: boolean } | null>(null);
  const [saving, startSaving] = useTransition();
  const hexId = useId();
  const logoHint = useId();

  const customHex = parseHex(hexText);
  const value = pick === CUSTOM ? (customHex ?? DEFAULT_COLOUR) : pick;
  const colour = resolveColour(value);
  const shade = pick === CUSTOM && customHex ? adjustedShade(customHex) : null;

  const save = () => {
    if (pick === CUSTOM && !customHex) {
      setMessage({ text: "Type a colour code such as #2563EB first.", failed: true });
      return;
    }
    startSaving(async () => {
      const result = await saveColourAction({ colour: value, logo });
      setMessage({ text: result.message, failed: !result.ok });
    });
  };
  const reset = () => {
    setPick(DEFAULT_COLOUR);
    setLogo(true);
    setMessage({ text: "Back to purple. Save to keep it.", failed: false });
  };

  return (
    <section
      aria-labelledby="colour-heading"
      className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[26rem_minmax(0,1fr)]"
    >
      <div className="flex flex-col gap-4 rounded-card border border-border bg-surface p-5">
        <h2 id="colour-heading" className="text-heading font-semibold">
          System colour
        </h2>
        <p className="text-small text-text-secondary">
          The colour of buttons, links, the current tab and highlights, for everyone, in light and
          dark. Department colours and the green, amber and red status colours don&apos;t change.
        </p>

        {/* Real radio buttons, so arrow keys move between colours. */}
        <fieldset className="grid grid-cols-4 gap-2.5">
          <legend className="sr-only">System colour</legend>
          {[...COLOUR_PRESETS, CUSTOM].map((key) => {
            const on = pick === key;
            const swatch: CSSProperties =
              key === CUSTOM
                ? {
                    background:
                      "conic-gradient(#f59e0b, #ef4444, #8b5cf6, #3b82f6, #10b981, #f59e0b)",
                  }
                : { background: PRESETS[key as keyof typeof PRESETS].light.accent };
            return (
              <label
                key={key}
                className={`relative flex cursor-pointer flex-col items-center gap-1.5 rounded-card bg-surface px-1 py-2.5 transition-surface hover:bg-hover has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent-light ${
                  on ? "border-2 border-text" : "border border-border"
                }`}
              >
                <input
                  type="radio"
                  name="system-colour"
                  value={key}
                  checked={on}
                  onChange={() => {
                    setPick(key);
                    setMessage(null);
                  }}
                  className="absolute inset-0 z-10 cursor-pointer appearance-none opacity-0"
                />
                <span
                  aria-hidden="true"
                  style={swatch}
                  className={`size-8 rounded-pill ${on ? "ring-2 ring-text ring-offset-2 ring-offset-surface" : ""}`}
                />
                <span className="text-small font-semibold text-text">
                  {key === CUSTOM ? "Custom" : PRESET_NAMES[key as keyof typeof PRESET_NAMES]}
                </span>
              </label>
            );
          })}
        </fieldset>

        {pick === CUSTOM ? (
          <div className="flex flex-col gap-2 border-t border-border pt-3.5">
            <label htmlFor={hexId} className="text-small font-semibold text-text">
              Your colour (hex)
            </label>
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="size-10 shrink-0 rounded-button border border-border"
                style={{ background: customHex ?? "transparent" }}
              />
              <input
                id={hexId}
                value={hexText}
                onChange={(event) => setHexText(event.target.value)}
                maxLength={7}
                spellCheck={false}
                autoComplete="off"
                className={`${fieldClasses} flex-1 uppercase`}
              />
            </div>
            <p
              role="status"
              className={`rounded-button border px-2.5 py-2 text-small ${
                !customHex || shade
                  ? "border-warning-line bg-warning-soft text-text"
                  : "border-success-line bg-success-soft text-text"
              }`}
            >
              {!customHex ? (
                "Type a colour code, such as #2563EB."
              ) : shade ? (
                <>
                  That colour is too light for white text on buttons, so the app uses a deeper shade
                  of it, <strong>{shade.toUpperCase()}</strong>, which everyone can read. The
                  preview shows what you&apos;ll get.
                </>
              ) : (
                "Everyone can read white text on that colour."
              )}
            </p>
          </div>
        ) : null}

        <div className="flex flex-col gap-1">
          <label className="flex items-center gap-2.5 font-semibold">
            <input
              type="checkbox"
              checked={logo}
              onChange={(event) => setLogo(event.target.checked)}
              aria-describedby={logoHint}
              className="size-[1.125rem] accent-[var(--accent)]"
            />
            The logo&apos;s dot uses it too
          </label>
          <p id={logoHint} className="pl-7 text-small text-text-muted">
            Off keeps the Signal Line purple dot whatever you pick.
          </p>
        </div>

        <p className="text-small text-text-muted">
          Also follows: the app&apos;s colour on phones (the top bar when installed), and the
          buttons in emails. Every change is in the Audit log, and <strong>Reset</strong> puts back
          purple.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
            <span className="sr-only"> colour</span>
          </Button>
          <Button type="button" variant="secondary" onClick={reset}>
            Reset<span className="sr-only"> colour</span>
          </Button>
        </div>
        <p
          role="status"
          className={`min-h-5 text-small ${message?.failed ? "text-error" : "text-text-secondary"}`}
        >
          {message?.text}
        </p>
      </div>

      <div className="flex flex-col gap-3.5">
        <p className="text-small font-bold text-text-secondary">
          Preview: pick a colour on the left
        </p>
        <Preview theme="light" vars={previewVars("light", colour, logo)} />
        <Preview theme="dark" vars={previewVars("dark", colour, logo)} />
      </div>
    </section>
  );
}

/** One theme, drawn with the app's own token classes under that theme's colours. */
function Preview({ theme, vars }: { theme: "light" | "dark"; vars: Record<string, string> }) {
  return (
    <div
      role="img"
      aria-label={`${theme === "light" ? "Light" : "Dark"} theme with this colour`}
      style={vars as CSSProperties}
      className="flex flex-col gap-2.5 rounded-card border border-border bg-bg p-4 text-text transition-colors"
    >
      <p className="text-[0.6875rem] font-bold tracking-[0.06em] text-text-muted uppercase">
        {theme === "light" ? "Light" : "Dark"}
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[10.5rem_minmax(0,1fr)]">
        <div className="hidden flex-col gap-1 rounded-card border border-border bg-surface p-2.5 text-small sm:flex">
          <span className="flex items-center gap-2 px-1.5 pt-1 pb-2.5">
            <Logo variant="mark" size={18} label="" decorative />
            <span className="font-bold">IFC Academy</span>
          </span>
          <span className="rounded-button bg-accent-soft px-2 py-1.5 font-semibold">Training</span>
          <span className="px-2 py-1.5 text-text-muted">Courses</span>
          <span className="px-2 py-1.5 text-text-muted">Schedule</span>
        </div>
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex items-center gap-3 rounded-card border border-border bg-card p-3">
            <span className="h-10 w-16 shrink-0 rounded-button bg-[var(--photo-bg)]" />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-small font-bold">1. Sound Systems Overview</span>
              <span className="text-small text-text-muted">
                Lesson 1 of 6 · 10 min ·{" "}
                <span className="font-semibold text-accent-light">Audio</span>
              </span>
            </span>
            <span className="flex h-9 shrink-0 items-center rounded-pill bg-accent px-4 text-small font-semibold text-on-accent">
              ▶ Continue
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="flex h-9 items-center rounded-pill bg-accent px-4 text-small font-semibold text-on-accent">
              ▶ Start the course
            </span>
            <span className="flex h-8.5 items-center rounded-button bg-accent px-3.5 text-small font-semibold text-on-accent">
              Mark complete
            </span>
            <span className="flex gap-1 rounded-card border border-border-strong bg-surface p-1">
              <span className="flex h-8.5 items-center gap-1.5 rounded-button bg-accent px-3 text-small font-bold text-on-accent">
                All tasks
                <span className="rounded-pill bg-on-accent/25 px-1.5 text-[0.6875rem]">16</span>
              </span>
              <span className="flex h-8.5 items-center gap-1.5 px-3 text-small font-semibold">
                Still to do
                <span className="rounded-pill bg-accent-soft px-1.5 text-[0.6875rem]">16</span>
              </span>
            </span>
          </div>
          <div className="grid max-w-[26rem] grid-cols-5 gap-0.5 rounded-[1.25rem] border border-border bg-surface p-1.5">
            {["Training", "Courses", "Messages", "Schedule"].map((label) => (
              <span
                key={label}
                className="flex h-9.5 items-center justify-center text-[0.6875rem] text-text-muted"
              >
                {label}
              </span>
            ))}
            <span className="tab-pill flex h-9.5 items-center justify-center rounded-[0.875rem] text-[0.6875rem] font-bold text-on-accent">
              Serve
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
