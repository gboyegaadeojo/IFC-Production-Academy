"use client";

import { useState } from "react";
import { ActionForm } from "@/components/ui/action-form";
import { fieldClasses } from "@/components/ui/field-classes";
import { Button } from "@/components/ui/button";
import {
  EVENT_TIME_KINDS,
  EVENT_TIME_LABELS,
  type EventTime,
  type EventTimeKind,
} from "@/lib/domain/plan";
import { saveTimesAction } from "./plan-actions";

/** A service's extra times on its day: rehearsal, sound check, or anything else. */
export function TimesEditor({
  eventId,
  startsAt,
  initialTimes,
}: {
  eventId: string;
  startsAt: string;
  initialTimes: EventTime[];
}) {
  const [times, setTimes] = useState<EventTime[]>(initialTimes);
  const update = (index: number, change: Partial<EventTime>) =>
    setTimes((current) =>
      current.map((time, at) => (at === index ? { ...time, ...change } : time)),
    );

  return (
    <div className="flex flex-col gap-3">
      {times.length === 0 ? (
        <p className="text-small text-text-muted">
          No extra times. Add a rehearsal or sound check.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {times.map((time, index) => (
            <li key={index} className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1">
                <span className="sr-only">Kind of time {index + 1}</span>
                <select
                  value={time.kind}
                  onChange={(event) => update(index, { kind: event.target.value as EventTimeKind })}
                  className={fieldClasses}
                >
                  {EVENT_TIME_KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {EVENT_TIME_LABELS[kind]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="sr-only">Time {index + 1} starts</span>
                <input
                  type="time"
                  value={time.start}
                  onChange={(event) => update(index, { start: event.target.value })}
                  className={fieldClasses}
                />
              </label>
              <span className="pb-2 text-text-muted">to</span>
              <label className="flex flex-col gap-1">
                <span className="sr-only">Time {index + 1} ends</span>
                <input
                  type="time"
                  value={time.end}
                  onChange={(event) => update(index, { end: event.target.value })}
                  className={fieldClasses}
                />
              </label>
              <label className="flex min-w-40 flex-1 flex-col gap-1">
                <span className="sr-only">Label for time {index + 1} (optional)</span>
                <input
                  value={time.label}
                  maxLength={60}
                  placeholder="Label (optional)"
                  onChange={(event) => update(index, { label: event.target.value })}
                  className={fieldClasses}
                />
              </label>
              <Button
                variant="tertiary"
                size="sm"
                onClick={() => setTimes((current) => current.filter((_, at) => at !== index))}
              >
                Remove<span className="sr-only"> time {index + 1}</span>
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          onClick={() =>
            setTimes((current) => [
              ...current,
              { kind: "rehearsal", label: "", start: "08:30", end: "09:30" },
            ])
          }
        >
          Add a time
        </Button>
      </div>
      <ActionForm
        action={saveTimesAction}
        submitLabel="Save times"
        pendingLabel="Saving…"
        hidden={{ eventId, startsAt }}
      >
        <input type="hidden" name="times" value={JSON.stringify(times)} />
      </ActionForm>
    </div>
  );
}
