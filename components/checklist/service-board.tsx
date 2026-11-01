"use client";

import { useState, type CSSProperties } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { departmentHueVar } from "@/lib/domain/departments";
import {
  boardSections,
  progressLabel,
  percentDone,
  type BoardFilter,
  type TickResult,
} from "@/lib/domain/checklists";
import { ChecklistItem } from "./checklist-item";

export type BoardChecklist = {
  id: string;
  name: string;
  departmentHue: string;
  isMine: boolean;
  done: number;
  total: number;
  sections: {
    id: string;
    name: string;
    items: {
      id: string;
      text: string;
      checkedByName: string | null;
      checkedAt: string | null;
      /** Formatted on the server, in Winnipeg time. */
      checkedTime: string | null;
    }[];
  }[];
};

/**
 * The service-day board (approved mock, 2026-11-01): departments down the side with their
 * progress, your own first and marked "You"; the chosen department's sections beside it. On iPad
 * and phone the departments become a strip that scrolls sideways. Choosing a department or the
 * "Still to do" filter changes only what's shown; ticking works as before.
 */
export function ServiceBoard({
  checklists,
  eventId,
  canTick,
  action,
}: {
  /** In board order: your own first. */
  checklists: readonly BoardChecklist[];
  eventId: string;
  canTick: boolean;
  action: (input: {
    eventId: string;
    itemId: string;
    checked: boolean;
    tabId?: string;
  }) => Promise<TickResult>;
}) {
  const [currentId, setCurrentId] = useState(checklists[0]?.id ?? "");
  const [filter, setFilter] = useState<BoardFilter>("all");
  const current = checklists.find((c) => c.id === currentId) ?? checklists[0];
  if (!current) {
    return null;
  }
  const sections = boardSections(current.sections, filter);

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[17.5rem_minmax(0,1fr)] lg:gap-7">
      <nav aria-label="Departments" className="min-w-0 lg:sticky lg:top-20">
        <p className="mb-2 ml-1 hidden eyebrow lg:block">Departments</p>
        <ul className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:gap-1.5 lg:overflow-visible lg:pb-0">
          {checklists.map((checklist) => {
            const selected = checklist.id === current.id;
            const label = progressLabel(checklist.done, checklist.total);
            return (
              <li key={checklist.id} className="shrink-0 lg:shrink">
                <button
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setCurrentId(checklist.id)}
                  style={{ "--dept": departmentHueVar(checklist.departmentHue) } as CSSProperties}
                  className={`grid min-h-touch w-48 grid-cols-[0.5rem_minmax(0,1fr)_auto] items-center gap-x-2.5 rounded-button border px-3 py-2.5 text-left transition-surface hover:bg-card lg:w-full ${
                    selected ? "border-border bg-card" : "border-border lg:border-transparent"
                  }`}
                >
                  <span aria-hidden="true" className="size-2 rounded-pill bg-[var(--dept)]" />
                  <span className="flex min-w-0 flex-col gap-1.5">
                    <span className="flex items-center gap-1.5 text-small font-medium text-text">
                      <span className="truncate">{checklist.name}</span>
                      {checklist.isMine ? (
                        <span className="shrink-0 rounded-pill border border-accent px-1.5 font-mono text-[0.65625rem] tracking-[0.08em] text-accent-light">
                          YOU
                        </span>
                      ) : null}
                    </span>
                    <span
                      aria-hidden="true"
                      className="h-[3px] overflow-hidden rounded-pill bg-hover"
                    >
                      <span
                        className="block h-full rounded-pill bg-[var(--dept)]"
                        style={{ width: `${percentDone(checklist.done, checklist.total)}%` }}
                      />
                    </span>
                  </span>
                  <span className="tabular font-mono text-[0.75rem] text-text-secondary">
                    <span aria-hidden="true">
                      {checklist.done}/{checklist.total}
                    </span>
                    <span className="sr-only">, {label}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <section aria-labelledby="board-heading" className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="board-heading" className="text-title font-semibold">
            {current.isMine ? `Your checklist: ${current.name}` : current.name}
          </h2>
          <div
            role="group"
            aria-label="Show"
            className="inline-flex gap-0.5 rounded-pill border border-border p-[3px]"
          >
            {(
              [
                ["all", "All tasks"],
                ["todo", "Still to do"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
                className="min-h-9 rounded-pill px-3 text-small text-text-secondary transition-surface hover:text-text aria-pressed:bg-hover aria-pressed:text-text"
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {sections.length === 0 ? (
          <EmptyState title="All done">Everything in this department is ticked.</EmptyState>
        ) : (
          <div className="grid items-start gap-3.5 xl:grid-cols-2">
            {sections.map((section) => {
              const complete = section.total > 0 && section.done === section.total;
              return (
                <section
                  key={section.id}
                  aria-labelledby={`section-${section.id}`}
                  className="overflow-hidden rounded-card border border-border bg-surface"
                >
                  <div className="flex items-center justify-between gap-2.5 border-b border-border px-4 py-3.5">
                    <h3 id={`section-${section.id}`} className="font-medium">
                      {section.name}
                    </h3>
                    <span
                      className={`tabular font-mono text-[0.75rem] ${complete ? "text-success" : "text-text-muted"}`}
                    >
                      <span aria-hidden="true">
                        {complete ? "✓ " : ""}
                        {section.done}/{section.total}
                      </span>
                      <span className="sr-only">{progressLabel(section.done, section.total)}</span>
                    </span>
                  </div>
                  <ul>
                    {section.shown.map((item) => (
                      <ChecklistItem
                        key={item.id}
                        eventId={eventId}
                        itemId={item.id}
                        text={item.text}
                        checked={item.checkedAt !== null}
                        checkedBy={item.checkedByName}
                        checkedTime={item.checkedTime}
                        disabled={!canTick}
                        action={action}
                      />
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
