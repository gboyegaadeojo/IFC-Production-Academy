"use client";

import { useId, useOptimistic, useState, useTransition } from "react";
import { CheckIcon } from "@/components/ui/icons";
import type { TickResult } from "@/lib/domain/checklists";
import { getTabId } from "./tab-id";

/**
 * One checklist item to tick (decision record 9, stage 2; approved mock, 2026-11-01). A native
 * checkbox inside its label, so the whole row is a large target and it works with every input
 * method; the tick shows at once and is saved in the background. If the save fails, the tick goes
 * back and the reason is announced.
 */
export function ChecklistItem({
  eventId,
  itemId,
  text,
  checked,
  checkedBy,
  checkedTime = null,
  disabled,
  action,
}: {
  eventId: string;
  itemId: string;
  text: string;
  checked: boolean;
  checkedBy: string | null;
  /** When it was ticked, already formatted in Winnipeg time. */
  checkedTime?: string | null;
  disabled: boolean;
  action: (input: {
    eventId: string;
    itemId: string;
    checked: boolean;
    tabId?: string;
  }) => Promise<TickResult>;
}) {
  const id = useId();
  const [optimistic, setOptimistic] = useOptimistic(checked);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <li className="border-t border-border first:border-t-0">
      <label
        htmlFor={id}
        className={`grid grid-cols-[1.75rem_minmax(0,1fr)] items-start gap-3 px-4 py-3 transition-surface ${
          disabled ? "cursor-not-allowed" : "cursor-pointer hover:bg-card"
        }`}
      >
        <span className="relative mt-px size-6">
          <input
            id={id}
            type="checkbox"
            checked={optimistic}
            disabled={disabled}
            aria-labelledby={`${id}-text`}
            aria-describedby={error ? `${id}-error` : checkedBy ? `${id}-by` : undefined}
            onChange={(event) => {
              const next = event.target.checked;
              setError(null);
              startTransition(async () => {
                setOptimistic(next);
                const result = await action({ eventId, itemId, checked: next, tabId: getTabId() });
                if (!result.ok) {
                  setError(result.message);
                }
              });
            }}
            className="peer absolute inset-0 m-0 size-6 cursor-pointer appearance-none rounded-[7px] border-[1.5px] border-border-strong bg-transparent transition-surface checked:border-accent checked:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-light disabled:cursor-not-allowed disabled:opacity-60"
          />
          <CheckIcon className="pointer-events-none absolute inset-0 m-auto size-[15px] text-on-accent opacity-0 peer-checked:opacity-100" />
        </span>
        <span className="flex min-w-0 flex-col gap-1">
          <span id={`${id}-text`} className={optimistic ? "text-text-secondary" : "text-text"}>
            {text}
          </span>
          {error ? (
            <span id={`${id}-error`} role="alert" className="text-small text-error">
              {error}
            </span>
          ) : optimistic && checkedBy && !pending ? (
            <span id={`${id}-by`} className="text-small text-text-muted">
              Done by {checkedBy}
              {checkedTime ? ` · ${checkedTime}` : ""}
            </span>
          ) : null}
        </span>
      </label>
    </li>
  );
}
