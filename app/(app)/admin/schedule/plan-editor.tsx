"use client";

import { useState, type ReactNode } from "react";
import { ActionForm, fieldClasses, type FormAction } from "@/components/ui/action-form";
import { Button } from "@/components/ui/button";
import {
  clockAfter,
  formatLength,
  parseLength,
  PLAN_ITEM_KIND_LABELS,
  PLAN_ITEM_KINDS,
  planTimeline,
  type PlanItem,
  type PlanItemKind,
} from "@/lib/domain/plan";

type Row = PlanItem & { key: string; lengthText: string };

let nextKey = 0;
const toRow = (item: PlanItem): Row => ({
  ...item,
  key: `row-${(nextKey += 1)}`,
  lengthText: item.kind === "header" ? "" : formatLength(item.lengthSeconds),
});

/**
 * An order of service to edit: items, songs, and section headers, with lengths that add up and
 * notes for departments. Everything is sent in one go with the form's other fields.
 */
export function PlanEditor({
  initialItems,
  headings,
  startsAt,
  action,
  hidden,
  submitLabel,
  children,
}: {
  initialItems: PlanItem[];
  /** Who notes can be for: the departments. */
  headings: string[];
  /** The service's start, to show the clock time each item starts. Templates have none. */
  startsAt?: string;
  action: FormAction;
  hidden: Record<string, string>;
  submitLabel: string;
  children?: ReactNode;
}) {
  const [rows, setRows] = useState<Row[]>(() => initialItems.map(toRow));
  const [newKind, setNewKind] = useState<PlanItemKind>("item");
  const [newTitle, setNewTitle] = useState("");
  const { starts, totalSeconds } = planTimeline(rows);

  const update = (key: string, change: Partial<Row>) =>
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...change } : row)));
  const move = (index: number, by: -1 | 1) =>
    setRows((current) => {
      const next = [...current];
      const [row] = next.splice(index, 1);
      if (row) {
        next.splice(index + by, 0, row);
      }
      return next;
    });

  const items: PlanItem[] = rows.map(({ id, kind, title, lengthSeconds, notes }) => ({
    id,
    kind,
    title,
    lengthSeconds,
    notes,
  }));

  return (
    <div className="flex flex-col gap-4">
      <p className="text-small text-text-secondary tabular-nums" aria-live="polite">
        {rows.length === 0
          ? "No items yet."
          : `Total ${formatLength(totalSeconds)}${startsAt ? `, ending about ${clockAfter(startsAt, totalSeconds)}` : ""}.`}
      </p>

      {rows.length > 0 ? (
        <ol className="flex flex-col divide-y divide-border rounded-card border border-border">
          {rows.map((row, index) => {
            const name = row.title.trim() || `item ${index + 1}`;
            return (
              <li
                key={row.key}
                className={`flex flex-col gap-2 px-3 py-3 ${row.kind === "header" ? "bg-card" : ""}`}
              >
                <div className="flex flex-wrap items-end gap-2">
                  {row.kind !== "header" ? (
                    <span className="w-14 pb-2 text-small text-text-muted tabular-nums">
                      {startsAt
                        ? clockAfter(startsAt, starts[index] ?? 0)
                        : formatLength(starts[index] ?? 0)}
                    </span>
                  ) : null}
                  <label className="flex flex-col gap-1">
                    <span className="sr-only">Kind of {name}</span>
                    <select
                      value={row.kind}
                      onChange={(event) =>
                        update(row.key, { kind: event.target.value as PlanItemKind })
                      }
                      className={fieldClasses}
                    >
                      {PLAN_ITEM_KINDS.map((kind) => (
                        <option key={kind} value={kind}>
                          {PLAN_ITEM_KIND_LABELS[kind]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex min-w-48 flex-1 flex-col gap-1">
                    <span className="sr-only">Title of item {index + 1}</span>
                    <input
                      value={row.title}
                      maxLength={120}
                      onChange={(event) => update(row.key, { title: event.target.value })}
                      className={`${fieldClasses} ${row.kind === "header" ? "font-semibold tracking-wide uppercase" : ""}`}
                    />
                  </label>
                  {row.kind !== "header" ? (
                    <label className="flex flex-col gap-1">
                      <span className="sr-only">Length of {name}, in minutes and seconds</span>
                      <input
                        value={row.lengthText}
                        inputMode="numeric"
                        placeholder="4:30"
                        aria-invalid={parseLength(row.lengthText) === null}
                        onChange={(event) => {
                          const seconds = parseLength(event.target.value);
                          update(row.key, {
                            lengthText: event.target.value,
                            lengthSeconds: seconds ?? row.lengthSeconds,
                          });
                        }}
                        className={`${fieldClasses} w-20 text-right tabular-nums`}
                      />
                    </label>
                  ) : null}
                  <span className="flex gap-1">
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                      aria-label={`Move ${name} up`}
                    >
                      ↑
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={index === rows.length - 1}
                      onClick={() => move(index, 1)}
                      aria-label={`Move ${name} down`}
                    >
                      ↓
                    </Button>
                    <Button
                      variant="tertiary"
                      size="sm"
                      onClick={() =>
                        update(row.key, {
                          notes: [...row.notes, { category: headings[0] ?? "", content: "" }],
                        })
                      }
                    >
                      Add note<span className="sr-only"> to {name}</span>
                    </Button>
                    <Button
                      variant="tertiary"
                      size="sm"
                      onClick={() =>
                        setRows((current) => current.filter((other) => other.key !== row.key))
                      }
                    >
                      Remove<span className="sr-only"> {name}</span>
                    </Button>
                  </span>
                </div>
                {row.notes.map((note, noteIndex) => (
                  <div key={noteIndex} className="flex flex-wrap items-end gap-2 sm:pl-16">
                    <label className="flex flex-col gap-1">
                      <span className="sr-only">
                        Who note {noteIndex + 1} on {name} is for
                      </span>
                      <select
                        value={note.category}
                        onChange={(event) =>
                          update(row.key, {
                            notes: row.notes.map((other, at) =>
                              at === noteIndex ? { ...other, category: event.target.value } : other,
                            ),
                          })
                        }
                        className={fieldClasses}
                      >
                        {(headings.includes(note.category) || note.category === ""
                          ? headings
                          : [note.category, ...headings]
                        ).map((heading) => (
                          <option key={heading} value={heading}>
                            {heading}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex min-w-48 flex-1 flex-col gap-1">
                      <span className="sr-only">
                        Note {noteIndex + 1} on {name}
                      </span>
                      <input
                        value={note.content}
                        maxLength={500}
                        placeholder="For example: cam 1 tight on the speaker"
                        onChange={(event) =>
                          update(row.key, {
                            notes: row.notes.map((other, at) =>
                              at === noteIndex ? { ...other, content: event.target.value } : other,
                            ),
                          })
                        }
                        className={fieldClasses}
                      />
                    </label>
                    <Button
                      variant="tertiary"
                      size="sm"
                      onClick={() =>
                        update(row.key, {
                          notes: row.notes.filter((_, at) => at !== noteIndex),
                        })
                      }
                    >
                      Remove note
                      <span className="sr-only">
                        {" "}
                        {noteIndex + 1} on {name}
                      </span>
                    </Button>
                  </div>
                ))}
              </li>
            );
          })}
        </ol>
      ) : null}

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-small font-medium text-text-secondary">
          Kind
          <select
            value={newKind}
            onChange={(event) => setNewKind(event.target.value as PlanItemKind)}
            className={fieldClasses}
          >
            {PLAN_ITEM_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {PLAN_ITEM_KIND_LABELS[kind]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-small font-medium text-text-secondary">
          New item
          <input
            value={newTitle}
            maxLength={120}
            placeholder="For example: Baptism"
            onChange={(event) => setNewTitle(event.target.value)}
            className={fieldClasses}
          />
        </label>
        <Button
          variant="secondary"
          disabled={newTitle.trim() === ""}
          onClick={() => {
            setRows((current) => [
              ...current,
              toRow({
                id: null,
                kind: newKind,
                title: newTitle.trim(),
                lengthSeconds: newKind === "header" ? 0 : 300,
                notes: [],
              }),
            ]);
            setNewTitle("");
          }}
        >
          Add to the end
        </Button>
      </div>

      <ActionForm action={action} submitLabel={submitLabel} pendingLabel="Saving…" hidden={hidden}>
        <input type="hidden" name="items" value={JSON.stringify(items)} />
        {children}
      </ActionForm>
    </div>
  );
}
