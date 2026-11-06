"use client";

import { useId, useState, useTransition, type ReactNode } from "react";
import { CheckIcon } from "@/components/ui/icons";
import {
  groupChoice,
  NOTIFICATION_GROUP_HINTS,
  NOTIFICATION_KIND_HINTS,
  NOTIFICATION_KIND_LABELS,
  type GroupChoice,
  type NotificationGroup,
  type NotificationKind,
} from "@/lib/domain/notifications";
import {
  setEmailChoiceAction,
  setGroupChoiceAction,
  setPhoneChoiceAction,
} from "@/app/(app)/notifications/actions";

type Channel = "phone" | "email";
type Choices = Record<Channel, Record<NotificationKind, boolean>>;
type SaveState = "idle" | "saving" | "saved" | "error";

const STATUS: Record<SaveState, string> = {
  idle: "Saved automatically",
  saving: "Saving…",
  saved: "Saved",
  error: "That didn't save. Try again.",
};

const CHANNELS: { id: Channel; label: string }[] = [
  { id: "phone", label: "Phone" },
  { id: "email", label: "Email" },
];

const PRESSED: Record<GroupChoice, "true" | "false" | "mixed"> = {
  on: "true",
  off: "false",
  some: "mixed",
};

/**
 * What reaches your phone and your email (SRS-NOTIF-002; refinements mock, approved 2026-11-06):
 * one Phone and one Email button per group instead of a switch for every kind, so a volunteer
 * makes six choices at most. "Fine-tune each alert" still sets kinds one by one. Choices save as
 * they change; a failed save puts them back and says so.
 */
export function NotificationChoices({
  groups,
  initial,
}: {
  groups: readonly NotificationGroup[];
  initial: Choices;
}) {
  const [choices, setChoices] = useState(initial);
  const [state, setState] = useState<SaveState>("idle");
  const [, startTransition] = useTransition();
  const headingId = useId();

  function save(update: Choices, undo: Choices, request: () => Promise<{ ok: boolean }>) {
    setChoices(update);
    setState("saving");
    startTransition(async () => {
      const result = await request();
      if (result.ok) {
        setState("saved");
      } else {
        setChoices(undo);
        setState("error");
      }
    });
  }

  function setGroup(group: NotificationGroup, channel: Channel, on: boolean) {
    const next = { ...choices[channel] };
    for (const kind of group.kinds) next[kind] = on;
    save({ ...choices, [channel]: next }, choices, () =>
      setGroupChoiceAction(group.id, channel, on),
    );
  }

  function setKind(kind: NotificationKind, channel: Channel, on: boolean) {
    save({ ...choices, [channel]: { ...choices[channel], [kind]: on } }, choices, () =>
      channel === "phone" ? setPhoneChoiceAction(kind, on) : setEmailChoiceAction(kind, on),
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <section aria-labelledby={headingId} className="rounded-card border border-border bg-surface">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3.5">
          <h2 id={headingId} className="font-semibold">
            What to send me
          </h2>
          <p
            role={state === "error" ? "alert" : "status"}
            className={`text-small ${state === "error" ? "text-error" : "text-text-muted"}`}
          >
            {STATUS[state]}
          </p>
        </div>
        <ul className="divide-y divide-border">
          {groups.map((group) => (
            <li key={group.id} className="flex flex-col gap-2.5 px-4 py-3.5">
              <div className="flex flex-col gap-0.5">
                <span className="font-semibold">{group.title}</span>
                <span className="text-small text-text-muted">
                  {NOTIFICATION_GROUP_HINTS[group.id]}
                </span>
              </div>
              <div role="group" aria-label={group.title} className="flex flex-wrap gap-2">
                {CHANNELS.map(({ id, label }) => {
                  const current = groupChoice(group.kinds, choices[id]);
                  return (
                    <ChoiceButton
                      key={id}
                      pressed={PRESSED[current]}
                      onClick={() => setGroup(group, id, current !== "on")}
                    >
                      {label}
                      {current === "some" ? (
                        <span className="font-normal opacity-80">· some</span>
                      ) : null}
                    </ChoiceButton>
                  );
                })}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <details className="group rounded-card border border-border bg-surface [&_summary::-webkit-details-marker]:hidden">
        <summary className="flex min-h-touch cursor-pointer list-none flex-col justify-center gap-0.5 px-4 py-3">
          <span className="font-semibold">Fine-tune each alert</span>
          <span className="text-small text-text-muted">
            Choose kinds one by one. Most people never need this.
          </span>
        </summary>
        {groups.map((group) => (
          <fieldset key={group.id} className="border-t border-border py-1.5">
            <legend className="sr-only">{group.title}</legend>
            <p aria-hidden="true" className="mx-4 mt-3 mb-1 eyebrow">
              {group.title}
            </p>
            {group.kinds.map((kind) => {
              const hint = NOTIFICATION_KIND_HINTS[kind];
              return (
                <div
                  key={kind}
                  role="group"
                  aria-label={NOTIFICATION_KIND_LABELS[kind]}
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2.5"
                >
                  <span className="flex min-w-0 flex-col">
                    <span>{NOTIFICATION_KIND_LABELS[kind]}</span>
                    {hint ? <span className="text-small text-text-muted">{hint}</span> : null}
                  </span>
                  <span className="flex gap-2">
                    {CHANNELS.map(({ id, label }) => (
                      <ChoiceButton
                        key={id}
                        small
                        pressed={choices[id][kind] ? "true" : "false"}
                        onClick={() => setKind(kind, id, !choices[id][kind])}
                      >
                        {label}
                      </ChoiceButton>
                    ))}
                  </span>
                </div>
              );
            })}
          </fieldset>
        ))}
      </details>
    </div>
  );
}

/** A button that stays pressed while it's on. The fill and the tick both show it, not colour alone. */
function ChoiceButton({
  pressed,
  small = false,
  onClick,
  children,
}: {
  pressed: "true" | "false" | "mixed";
  small?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  const on = pressed !== "false";
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-pill border font-semibold transition-surface ${
        // Two sizes smaller than first built (G, 2026-11-06); still at least 24px to tap.
        small ? "min-h-7 px-2.5 text-[0.6875rem]" : "min-h-8 px-3 text-[0.75rem]"
      } ${
        on
          ? "border-text bg-text text-bg"
          : "border-border bg-surface text-text-secondary hover:bg-hover hover:text-text"
      }`}
    >
      <span aria-hidden="true" className="flex w-3 justify-center">
        {pressed === "true" ? (
          <CheckIcon className="size-3" />
        ) : pressed === "mixed" ? (
          <span className="h-0.5 w-2 rounded-pill bg-current" />
        ) : null}
      </span>
      {children}
    </button>
  );
}
