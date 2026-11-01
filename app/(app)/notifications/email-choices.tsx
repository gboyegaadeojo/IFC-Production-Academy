"use client";

import { useId, useState, useTransition } from "react";
import {
  NOTIFICATION_KIND_HINTS,
  NOTIFICATION_KIND_LABELS,
  type NotificationGroup,
  type NotificationKind,
} from "@/lib/domain/notifications";
import { setEmailChoiceAction } from "./actions";

type SaveState = "idle" | "saving" | "saved" | "error";

const STATUS: Record<SaveState, string> = {
  idle: "Saved automatically",
  saving: "Saving…",
  saved: "Saved",
  error: "That didn't save. Try again.",
};

/**
 * Email choices as switches that save on their own (SRS-NOTIF-002; approved mock, 2026-11-01).
 * Each is a native checkbox with role="switch", so it works with the keyboard and screen readers;
 * a failed save puts the switch back and says so.
 */
export function EmailChoices({
  groups,
  initial,
}: {
  groups: readonly NotificationGroup[];
  initial: Record<NotificationKind, boolean>;
}) {
  const [choices, setChoices] = useState(initial);
  const [state, setState] = useState<SaveState>("idle");
  const [, startTransition] = useTransition();
  const statusId = useId();

  function toggle(kind: NotificationKind, email: boolean) {
    setChoices((current) => ({ ...current, [kind]: email }));
    setState("saving");
    startTransition(async () => {
      const result = await setEmailChoiceAction(kind, email);
      if (result.ok) {
        setState("saved");
      } else {
        setChoices((current) => ({ ...current, [kind]: !email }));
        setState("error");
      }
    });
  }

  return (
    <section
      aria-labelledby="email-heading"
      className="rounded-card border border-border bg-surface"
    >
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
        <h2 id="email-heading" className="font-semibold">
          Email me
        </h2>
        <p
          id={statusId}
          role={state === "error" ? "alert" : "status"}
          className={`text-small ${state === "error" ? "text-error" : "text-text-muted"}`}
        >
          {STATUS[state]}
        </p>
      </div>
      {groups.map((group) => (
        <fieldset key={group.id} className="border-t border-border py-1.5 first-of-type:border-t-0">
          <legend className="sr-only">{group.title}</legend>
          <p
            aria-hidden="true"
            className="mx-5 mt-3.5 mb-1 font-mono text-[0.75rem] tracking-[0.12em] text-text-muted uppercase"
          >
            {group.title}
          </p>
          {group.kinds.map((kind) => {
            const hint = NOTIFICATION_KIND_HINTS[kind];
            return (
              <label
                key={kind}
                className="flex min-h-touch cursor-pointer items-center justify-between gap-4 px-5 py-2.5 transition-surface hover:bg-card"
              >
                <span className="flex flex-col">
                  <span className="text-body">{NOTIFICATION_KIND_LABELS[kind]}</span>
                  {hint ? <span className="text-small text-text-muted">{hint}</span> : null}
                </span>
                <span className="relative h-6 w-10 shrink-0">
                  <input
                    type="checkbox"
                    role="switch"
                    checked={choices[kind]}
                    onChange={(event) => toggle(kind, event.target.checked)}
                    className="peer absolute inset-0 m-0 cursor-pointer opacity-0"
                  />
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 rounded-pill border border-border-strong bg-hover transition-surface peer-checked:border-accent peer-checked:bg-accent peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent-light after:absolute after:top-[3px] after:left-[3px] after:size-4 after:rounded-pill after:bg-text-muted after:transition-transform after:duration-150 peer-checked:after:translate-x-4 peer-checked:after:bg-on-accent motion-reduce:after:transition-none"
                  />
                </span>
              </label>
            );
          })}
        </fieldset>
      ))}
    </section>
  );
}
