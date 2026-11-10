"use client";

import { useState, type CSSProperties } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { CheckIcon, ChevronDownIcon } from "@/components/ui/icons";
import { PanelButton, PanelHost, useClosePanel } from "@/components/ui/panel-sheet";
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
 * and phone one wide button names the checklist and opens a sheet to choose another (option B,
 * G 2026-11-10), in place of a strip that scrolled sideways. Choosing a department or the
 * "Still to do" filter changes only what's shown; ticking works as before.
 */
export function ServiceBoard({
  checklists,
  initialId,
  eventId,
  canTick,
  action,
}: {
  /** In board order: your own first. */
  checklists: readonly BoardChecklist[];
  /** The checklist to open on, such as the position you're serving in; the first otherwise. */
  initialId?: string | null;
  eventId: string;
  canTick: boolean;
  action: (input: {
    eventId: string;
    itemId: string;
    checked: boolean;
    tabId?: string;
  }) => Promise<TickResult>;
}) {
  const [currentId, setCurrentId] = useState(initialId ?? checklists[0]?.id ?? "");
  const [filter, setFilter] = useState<BoardFilter>("all");
  const current = checklists.find((c) => c.id === currentId) ?? checklists[0];
  if (!current) {
    return null;
  }
  const sections = boardSections(current.sections, filter);
  const position = checklists.indexOf(current) + 1;

  return (
    <PanelHost
      panels={[
        {
          key: "checklists",
          title: "Choose a checklist",
          content: (
            <ChecklistChoices
              checklists={checklists}
              currentId={current.id}
              onChoose={setCurrentId}
            />
          ),
        },
      ]}
    >
      {/* One phone-width column below lg, so nothing can widen the page past the phone. */}
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[17.5rem_minmax(0,1fr)] lg:gap-7">
        <PanelButton
          panel="checklists"
          className="grid min-h-16 w-full grid-cols-[0.625rem_minmax(0,1fr)_auto] items-center gap-3 rounded-card border border-accent/40 bg-surface px-3.5 py-3 text-left transition-surface hover:bg-card lg:hidden"
        >
          <span
            aria-hidden="true"
            style={deptStyle(current)}
            className="size-2.5 rounded-pill bg-[var(--dept)]"
          />
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="text-small text-text-muted">
              Checklist {position} of {checklists.length} · tap to change
            </span>
            <span className="flex items-center gap-1.5 font-semibold text-text">
              <span className="truncate">{current.name}</span>
              {current.isMine ? <YouTag /> : null}
            </span>
          </span>
          <span className="flex items-center gap-2">
            <Count checklist={current} />
            <span
              aria-hidden="true"
              className="flex size-8 items-center justify-center rounded-pill bg-accent-soft text-accent-light"
            >
              <ChevronDownIcon className="size-4" />
            </span>
          </span>
        </PanelButton>

        <nav aria-label="Departments" className="hidden min-w-0 lg:sticky lg:top-20 lg:block">
          <p className="mb-2 ml-1 eyebrow">Departments</p>
          <ul className="flex flex-col gap-1.5">
            {checklists.map((checklist) => {
              const selected = checklist.id === current.id;
              return (
                <li key={checklist.id}>
                  <button
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setCurrentId(checklist.id)}
                    style={deptStyle(checklist)}
                    className={`grid min-h-touch w-full grid-cols-[0.5rem_minmax(0,1fr)_auto] items-center gap-x-2.5 rounded-button border px-3 py-2.5 text-left transition-surface hover:bg-card ${
                      selected ? "border-border bg-card" : "border-transparent"
                    }`}
                  >
                    <span aria-hidden="true" className="size-2 rounded-pill bg-[var(--dept)]" />
                    <NameAndBar checklist={checklist} />
                    <Count checklist={checklist} />
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
            <div className="grid grid-cols-1 items-start gap-3.5 xl:grid-cols-2">
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
                        className={`tabular text-small ${complete ? "text-success" : "text-text-muted"}`}
                      >
                        <span aria-hidden="true">
                          {complete ? "✓ " : ""}
                          {section.done}/{section.total}
                        </span>
                        <span className="sr-only">
                          {progressLabel(section.done, section.total)}
                        </span>
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
    </PanelHost>
  );
}

function deptStyle(checklist: BoardChecklist): CSSProperties {
  return { "--dept": departmentHueVar(checklist.departmentHue) } as CSSProperties;
}

function YouTag() {
  return (
    <span className="shrink-0 rounded-pill border border-accent px-1.5 text-small text-accent-light">
      YOU
    </span>
  );
}

/** The name, YOU on your own, and a bar in the department's colour. Needs --dept set above it. */
function NameAndBar({ checklist }: { checklist: BoardChecklist }) {
  return (
    <span className="flex min-w-0 flex-col gap-1.5">
      <span className="flex items-center gap-1.5 text-small font-medium text-text">
        <span className="truncate">{checklist.name}</span>
        {checklist.isMine ? <YouTag /> : null}
      </span>
      <span aria-hidden="true" className="h-[3px] overflow-hidden rounded-pill bg-hover">
        <span
          className="block h-full rounded-pill bg-[var(--dept)]"
          style={{ width: `${percentDone(checklist.done, checklist.total)}%` }}
        />
      </span>
    </span>
  );
}

function Count({ checklist }: { checklist: BoardChecklist }) {
  return (
    <span className="tabular text-small text-text-secondary">
      <span aria-hidden="true">
        {checklist.done}/{checklist.total}
      </span>
      <span className="sr-only">, {progressLabel(checklist.done, checklist.total)}</span>
    </span>
  );
}

/** The phone's sheet: every checklist as a full-width row; choosing one closes it. */
function ChecklistChoices({
  checklists,
  currentId,
  onChoose,
}: {
  checklists: readonly BoardChecklist[];
  currentId: string;
  onChoose: (id: string) => void;
}) {
  const close = useClosePanel();
  return (
    <div className="flex flex-col gap-2">
      <p className="text-small text-text-secondary">
        Anyone on the media team can help with any of them.
      </p>
      <ul aria-label="Checklists" className="flex flex-col gap-1">
        {checklists.map((checklist) => {
          const selected = checklist.id === currentId;
          return (
            <li key={checklist.id}>
              <button
                type="button"
                aria-current={selected ? "true" : undefined}
                onClick={() => {
                  onChoose(checklist.id);
                  close();
                }}
                style={deptStyle(checklist)}
                className={`grid min-h-touch w-full grid-cols-[0.625rem_minmax(0,1fr)_auto_1.25rem] items-center gap-3 rounded-button px-3 py-2.5 text-left transition-surface hover:bg-hover ${
                  selected ? "bg-accent-soft" : ""
                }`}
              >
                <span aria-hidden="true" className="size-2.5 rounded-pill bg-[var(--dept)]" />
                <NameAndBar checklist={checklist} />
                <Count checklist={checklist} />
                {selected ? <CheckIcon className="size-5 text-accent-light" /> : <span />}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
