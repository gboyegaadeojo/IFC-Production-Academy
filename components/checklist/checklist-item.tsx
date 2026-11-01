"use client";

import { useId, useOptimistic, useState, useTransition } from "react";
import type { TickResult } from "@/lib/domain/checklists";
import { getTabId } from "./tab-id";

/**
 * One checklist item to tick (decision record 9, stage 2). A native checkbox with its label, so
 * it works with every input method; the tick shows at once and is saved in the background. If the
 * save fails, the tick goes back and the reason is announced.
 */
export function ChecklistItem({
  eventId,
  itemId,
  text,
  checked,
  checkedBy,
  disabled,
  action,
}: {
  eventId: string;
  itemId: string;
  text: string;
  checked: boolean;
  checkedBy: string | null;
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
    <li className="flex flex-col gap-1 px-4 py-3">
      <div className="flex items-start gap-3">
        <input
          id={id}
          type="checkbox"
          checked={optimistic}
          disabled={disabled}
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
          className="mt-0.5 size-6 shrink-0 cursor-pointer accent-[var(--dept,var(--accent))] disabled:cursor-not-allowed"
        />
        <label
          htmlFor={id}
          className={`cursor-pointer ${optimistic ? "text-text-secondary line-through decoration-text-muted" : "text-text"}`}
        >
          {text}
        </label>
      </div>
      {error ? (
        <p id={`${id}-error`} role="alert" className="pl-9 text-small text-error">
          {error}
        </p>
      ) : optimistic && checkedBy && !pending ? (
        <p id={`${id}-by`} className="pl-9 text-small text-text-muted">
          Done by {checkedBy}
        </p>
      ) : null}
    </li>
  );
}
