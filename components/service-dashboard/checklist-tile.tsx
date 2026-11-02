"use client";

import { useOptimistic, useState, useTransition } from "react";
import Link from "next/link";
import { setItemAction } from "@/app/(app)/serve/actions";
import { getTabId } from "@/components/checklist/tab-id";
import type { ServiceChecklist } from "@/lib/domain/checklists";

/**
 * This service's checklists in one small tile. A tick here is the same tick as in the Checklist,
 * with the same rules and the same activity log (ADD-DASH-05).
 */
export function ChecklistTile({
  eventId,
  checklists,
  canTick,
}: {
  eventId: string;
  checklists: ServiceChecklist[];
  canTick: boolean;
}) {
  if (checklists.length === 0) {
    return <p className="text-small text-text-secondary">No checklists for this service yet.</p>;
  }
  const done = checklists.reduce((sum, checklist) => sum + checklist.done, 0);
  const total = checklists.reduce((sum, checklist) => sum + checklist.total, 0);
  return (
    <>
      <p className="flex items-baseline justify-between gap-2 text-small text-text-secondary">
        {done} of {total} done
        <Link href={`/serve/${eventId}`} className="text-accent-light underline">
          Open Checklist
        </Link>
      </p>
      <div aria-hidden="true" className="h-1.5 shrink-0 overflow-hidden rounded-pill bg-hover">
        <div
          className="h-full rounded-pill bg-success"
          style={{ width: `${total === 0 ? 0 : (done / total) * 100}%` }}
        />
      </div>
      {checklists.map((checklist) => (
        <div key={checklist.id} className="flex flex-col">
          <h3 className="pt-1.5 eyebrow text-text-muted">{checklist.name}</h3>
          <ul className="flex flex-col">
            {checklist.sections
              .flatMap((section) => section.items)
              .map((item) => (
                <Tick
                  key={item.id}
                  eventId={eventId}
                  itemId={item.id}
                  text={item.text}
                  checked={item.checkedAt !== null}
                  disabled={!canTick}
                />
              ))}
          </ul>
        </div>
      ))}
    </>
  );
}

function Tick({
  eventId,
  itemId,
  text,
  checked,
  disabled,
}: {
  eventId: string;
  itemId: string;
  text: string;
  checked: boolean;
  disabled: boolean;
}) {
  const [optimistic, setOptimistic] = useOptimistic(checked);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  return (
    <li>
      <label className="flex cursor-pointer items-start gap-2 py-0.5 text-small">
        <input
          type="checkbox"
          checked={optimistic}
          disabled={disabled}
          onChange={(event) => {
            const next = event.target.checked;
            setError(null);
            startTransition(async () => {
              setOptimistic(next);
              const result = await setItemAction({
                eventId,
                itemId,
                checked: next,
                tabId: getTabId(),
              });
              if (!result.ok) {
                setError(result.message);
              }
            });
          }}
          className="mt-0.5 size-4 shrink-0 accent-success"
        />
        <span className={optimistic ? "text-text-muted line-through" : ""}>{text}</span>
      </label>
      {error ? (
        <p role="alert" className="text-[0.6875rem] text-error">
          {error}
        </p>
      ) : null}
    </li>
  );
}
