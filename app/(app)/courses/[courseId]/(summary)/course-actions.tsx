"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ActionForm, fieldClasses } from "@/components/ui/action-form";
import { ChevronDownIcon, ChevronLeftIcon, UserPlusIcon } from "@/components/ui/icons";
import { dueDateChoices, formatDueDate, type Assignee } from "@/lib/domain/course-assignments";
import { assignableMatches } from "@/lib/domain/course-progress";
import { assignFromCourseAction } from "../actions";

export type AssignSetup = {
  courseId: string;
  departmentId: string;
  courseTitle: string;
  people: Assignee[];
  /** Today in Winnipeg, "YYYY-MM-DD", from the server so the choices match its clock. */
  today: string;
};

/** A coloured square behind a menu item's icon. */
export function MenuTile({ className, children }: { className: string; children: ReactNode }) {
  return (
    <span
      aria-hidden="true"
      className={`flex size-8 shrink-0 items-center justify-center rounded-[0.5625rem] ${className}`}
    >
      {children}
    </span>
  );
}

/**
 * The Actions menu at the top of a course page (Course Page mock, approved 2026-11-05; coloured
 * with Assign, option 1, approved 2026-11-07). A disclosure, like the account menu: Tab moves
 * through it, Escape closes it and returns to the button, and a click outside closes it. Leaders
 * get Assign first, which turns the menu into a small form.
 */
export function CourseActions({
  children,
  assign,
}: {
  children: ReactNode;
  assign?: AssignSetup | null;
}) {
  const [mode, setMode] = useState<"closed" | "menu" | "assign">("closed");
  const open = mode !== "closed";
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    function onKey(event: KeyboardEvent) {
      // Escape in the Start over warning closes only the warning.
      if (event.key === "Escape" && !document.querySelector("dialog[open]")) {
        setMode("closed");
        buttonRef.current?.focus();
      }
    }
    function onPointer(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setMode("closed");
      }
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setMode(open ? "closed" : "menu")}
        className={`flex h-9 items-center gap-1.5 rounded-pill border pr-3 pl-3.5 font-semibold transition-surface pointer-coarse:h-11 ${
          open
            ? "border-accent bg-accent text-on-accent"
            : "border-[color-mix(in_srgb,var(--accent)_25%,transparent)] bg-accent-soft text-accent-light hover:brightness-105"
        }`}
      >
        Actions
        <ChevronDownIcon className="size-4" />
      </button>
      <div
        id={panelId}
        hidden={mode !== "menu"}
        className="absolute top-full right-0 z-20 mt-2 w-[min(18rem,calc(100vw-2rem))] rounded-card border border-border bg-surface p-1.5 shadow-[var(--shadow-lift)] [&>a]:flex [&>a]:min-h-touch [&>a]:items-center [&>a]:gap-3 [&>a]:rounded-button [&>a]:px-2.5 [&>a]:py-1.5 [&>a]:font-medium [&>a:hover]:bg-hover [&>button]:min-h-touch [&>button]:w-full [&>button]:justify-start [&>button]:gap-3 [&>button]:rounded-button [&>button]:px-2.5 [&>button]:py-1.5 [&>button]:text-text [&>button:hover]:bg-hover [&>button:hover]:no-underline"
      >
        {assign ? (
          <>
            <button type="button" onClick={() => setMode("assign")} className="text-left">
              <MenuTile className="bg-tile-violet text-tile-violet-ink">
                <UserPlusIcon className="size-4" />
              </MenuTile>
              <span className="flex min-w-0 flex-1 flex-col">
                Assign to someone
                <span className="text-small font-normal text-text-muted">
                  With an optional due date
                </span>
              </span>
              <span className="rounded-pill bg-card px-2 py-0.5 text-[0.6875rem] font-semibold text-text-secondary">
                Leaders
              </span>
            </button>
            <span aria-hidden="true" className="mx-2 my-1 block h-px bg-border" />
          </>
        ) : null}
        {children}
      </div>
      {assign && mode === "assign" ? (
        <AssignPanel setup={assign} onBack={() => setMode("menu")} />
      ) : null}
    </div>
  );
}

type DueChoice = "none" | "sunday" | "two_weeks" | "pick";

function AssignPanel({ setup, onBack }: { setup: AssignSetup; onBack: () => void }) {
  const [query, setQuery] = useState("");
  const [personId, setPersonId] = useState<string | null>(null);
  const [due, setDue] = useState<DueChoice>("none");
  const [picked, setPicked] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const titleId = useId();

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  const { matches, more } = assignableMatches(setup.people, [], query, 6);
  const person = setup.people.find((p) => p.userId === personId) ?? null;
  // The chosen person stays in the list while searching, so the choice is never hidden.
  const shown = person && !matches.includes(person) ? [person, ...matches.slice(0, 5)] : matches;
  const { thisSunday, inTwoWeeks } = dueDateChoices(setup.today);
  const dueOn =
    due === "sunday" ? thisSunday : due === "two_weeks" ? inTwoWeeks : due === "pick" ? picked : "";
  const choices: { value: DueChoice; label: string; title?: string }[] = [
    { value: "none", label: "No due date" },
    { value: "sunday", label: "This Sunday", title: formatDueDate(thisSunday) },
    { value: "two_weeks", label: "In 2 weeks", title: formatDueDate(inTwoWeeks) },
    { value: "pick", label: "Pick a date" },
  ];

  return (
    <section
      aria-labelledby={titleId}
      className="absolute top-full right-0 z-20 mt-2 flex w-[min(21rem,calc(100vw-2rem))] flex-col gap-3 rounded-card border border-border bg-surface p-3.5 shadow-[var(--shadow-lift)]"
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to actions"
          className="flex size-8 shrink-0 items-center justify-center rounded-pill bg-card transition-surface hover:bg-hover pointer-coarse:size-11"
        >
          <ChevronLeftIcon className="size-4" />
        </button>
        <h2 id={titleId} className="min-w-0 font-semibold">
          Assign {setup.courseTitle}
        </h2>
      </div>
      <ActionForm
        action={assignFromCourseAction}
        submitLabel={person ? `Assign to ${person.name.split(" ")[0]}` : "Assign"}
        pendingLabel="Assigning…"
        hidden={{ courseId: setup.courseId, departmentId: setup.departmentId, dueOn }}
        className="flex flex-col gap-3"
        buttonClassName="rounded-pill px-5 font-semibold"
      >
        <label className="sr-only" htmlFor={`${titleId}-search`}>
          Find a person
        </label>
        <input
          ref={searchRef}
          id={`${titleId}-search`}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Find a person"
          autoComplete="off"
          maxLength={60}
          className={`${fieldClasses} w-full`}
        />
        {shown.length === 0 ? (
          <p className="text-small text-text-secondary">Nobody matches that.</p>
        ) : (
          <fieldset className="flex flex-col gap-0.5">
            <legend className="sr-only">Who should take this course?</legend>
            {shown.map((p) => (
              <label
                key={p.userId}
                className="flex min-h-touch cursor-pointer items-center gap-2.5 rounded-button border border-transparent px-2 py-1.5 transition-surface hover:bg-hover has-[:checked]:border-accent has-[:checked]:bg-accent-soft"
              >
                <input
                  type="radio"
                  name="userId"
                  value={p.userId}
                  checked={personId === p.userId}
                  onChange={() => setPersonId(p.userId)}
                  required
                  className="accent-[var(--accent)]"
                />
                <span className="flex min-w-0 flex-col">
                  {p.name}
                  {p.note ? <span className="text-small text-text-muted">{p.note}</span> : null}
                </span>
              </label>
            ))}
            {more ? (
              <p className="px-2 pt-1 text-small text-text-muted">
                Keep typing to find someone else.
              </p>
            ) : null}
          </fieldset>
        )}
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-small font-semibold text-text-secondary">
            Due date <span className="font-normal text-text-muted">(optional)</span>
          </legend>
          <div className="flex flex-wrap gap-1.5">
            {choices.map((choice) => (
              <label
                key={choice.value}
                title={choice.title}
                className="flex min-h-8 cursor-pointer items-center rounded-pill border border-border bg-surface px-3 text-small font-semibold transition-surface hover:bg-hover has-[:checked]:border-text has-[:checked]:bg-text has-[:checked]:text-bg has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent-light pointer-coarse:min-h-11"
              >
                <input
                  type="radio"
                  name="dueChoice"
                  value={choice.value}
                  checked={due === choice.value}
                  onChange={() => setDue(choice.value)}
                  className="sr-only"
                />
                {choice.label}
                {choice.title ? <span className="sr-only">, {choice.title}</span> : null}
              </label>
            ))}
          </div>
          {due === "pick" ? (
            <label className="flex flex-col gap-1 text-small text-text-secondary">
              Due on
              <input
                type="date"
                value={picked}
                min={setup.today}
                onChange={(event) => setPicked(event.target.value)}
                required
                className={`${fieldClasses} w-full`}
              />
            </label>
          ) : null}
        </fieldset>
        <p className="text-small text-text-muted">
          They&apos;ll see it on Training and get a notification. A due date is a date to aim for:
          it never stops them doing anything.
        </p>
      </ActionForm>
    </section>
  );
}
