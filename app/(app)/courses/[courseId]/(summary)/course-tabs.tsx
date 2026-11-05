"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

/**
 * About and Quiz results (Course Page mock, approved 2026-11-05). They switch here, without going
 * back to the server, because the page already has both. Arrow keys move between the tabs.
 */
export function CourseTabs({ tabs }: { tabs: { id: string; label: string; panel: ReactNode }[] }) {
  const [selected, setSelected] = useState(tabs[0]?.id);
  const prefix = useId();
  const refs = useRef(new Map<string, HTMLButtonElement>());

  function onKeyDown(event: KeyboardEvent, index: number) {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    const next = tabs[(index + step + tabs.length) % tabs.length];
    if (step !== 0 && next) {
      event.preventDefault();
      setSelected(next.id);
      refs.current.get(next.id)?.focus();
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div
        role="tablist"
        aria-label="About this course"
        className="flex gap-6 border-b border-border"
      >
        {tabs.map((tab, index) => {
          const current = tab.id === selected;
          return (
            <button
              key={tab.id}
              ref={(element) => {
                if (element) {
                  refs.current.set(tab.id, element);
                }
              }}
              type="button"
              role="tab"
              id={`${prefix}-${tab.id}-tab`}
              aria-selected={current}
              aria-controls={`${prefix}-${tab.id}`}
              tabIndex={current ? 0 : -1}
              onClick={() => setSelected(tab.id)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={`relative flex min-h-touch items-center text-body transition-surface ${
                current
                  ? "font-semibold text-text after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:rounded-pill after:bg-text"
                  : "font-medium text-text-muted hover:text-text"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`${prefix}-${tab.id}`}
          aria-labelledby={`${prefix}-${tab.id}-tab`}
          hidden={tab.id !== selected}
        >
          {tab.panel}
        </div>
      ))}
    </div>
  );
}
