"use client";

import Link from "next/link";
import { useState, useTransition, type DragEvent, type ReactNode } from "react";
import { buttonClasses } from "@/components/ui/button";
import { ChevronDownIcon, ChevronRightIcon } from "@/components/ui/icons";
import { STEP_GROUPS, STEP_KINDS, type StepKind } from "@/lib/domain/onboarding";
import { addStepAction, dropStepAction, moveStageAction, moveStepAction } from "./actions";
import { StepIcon } from "./step-icon";

export type BuilderStep = {
  id: string;
  kind: StepKind;
  title: string;
  summary: string;
  /** What it still needs before it works (stepNeedsSetup), or null. */
  needsSetup: string | null;
};
export type BuilderStage = {
  id: string;
  name: string;
  timing: string;
  peopleHere: number;
  steps: BuilderStep[];
};

/**
 * One column of stages and steps, with a step's settings opening inside it (Course Hierarchy mock,
 * approved 2026-11-04). Add a step opens the library beside them, for dragging or the Add buttons.
 * Steps move by drag and drop, or by the arrow buttons and Alt+Up/Down for keyboards and touch
 * screens. Every change saves straight away; the page refreshes from the server. Choosing a step or
 * stage is handled by the parent in the browser, without a server round trip.
 */
export function Builder({
  pathwayId,
  stages,
  selectedStepId,
  selectedStageId,
  stepPanel,
  stagePanel,
  footer,
  onSelectStep,
  onSelectStage,
}: {
  pathwayId: string;
  stages: BuilderStage[];
  selectedStepId: string | null;
  selectedStageId: string | null;
  /** The chosen step's settings, shown inside it. */
  stepPanel: ReactNode;
  /** The chosen stage's settings, shown under its heading. */
  stagePanel: ReactNode;
  /** More actions, beside Add a step. */
  footer: ReactNode;
  onSelectStep: (stepId: string) => void;
  onSelectStage: (stageId: string) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [over, setOver] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [libraryOpen, setLibraryOpen] = useState(false);
  const order = stages.map((s) => ({ id: s.id, steps: s.steps.map((st) => ({ id: st.id })) }));
  const href = (stepId: string) => `/admin/onboarding?pathway=${pathwayId}&step=${stepId}`;

  const target = (() => {
    const holder = stages.find((s) => s.steps.some((st) => st.id === selectedStepId));
    const stage = holder ?? stages.at(-1);
    return stage
      ? {
          stageId: stage.id,
          afterStepId: holder ? selectedStepId : (stage.steps.at(-1)?.id ?? null),
        }
      : null;
  })();

  function add(kind: StepKind, stageId: string, afterStepId: string | null) {
    startTransition(async () => {
      const done = await addStepAction({ pathwayId, stageId, afterStepId, kind });
      setStatus(done.ok ? `Added “${STEP_KINDS[kind].label}”.` : "That step couldn't be added.");
      if (done.ok && done.stepId) {
        onSelectStep(done.stepId);
      }
    });
  }
  function move(stepId: string, direction: "up" | "down", title: string) {
    startTransition(async () => {
      await moveStepAction(order, stepId, direction);
      setStatus(`Moved “${title}” ${direction}.`);
      requestAnimationFrame(() => document.getElementById(`step-${stepId}`)?.focus());
    });
  }
  function drop(event: DragEvent, stageId: string, index: number, afterStepId: string | null) {
    event.preventDefault();
    setOver(null);
    const payload = event.dataTransfer.getData("text/plain");
    if (payload.startsWith("kind:")) {
      add(payload.slice(5) as StepKind, stageId, afterStepId);
    } else if (payload.startsWith("step:")) {
      startTransition(async () => {
        await dropStepAction(order, payload.slice(5), stageId, index);
        setStatus("Step moved.");
      });
    }
  }
  const slot = (stageId: string, index: number, afterStepId: string | null) => {
    const key = `${stageId}:${index}`;
    return (
      <div
        aria-hidden="true"
        onDragOver={(e) => {
          e.preventDefault();
          setOver(key);
        }}
        onDragLeave={() => setOver(null)}
        onDrop={(e) => drop(e, stageId, index, afterStepId)}
        className={`rounded-button transition-[height] duration-100 ${
          over === key
            ? "my-1 h-10 bg-accent-soft outline-[1.5px] outline-accent outline-dashed"
            : "h-2"
        }`}
      />
    );
  };

  return (
    <div
      className={`grid items-start gap-4 ${libraryOpen ? "max-w-[62rem] lg:grid-cols-[minmax(0,1fr)_15rem]" : "max-w-[46rem]"}`}
    >
      <section aria-label="Pathway steps" aria-busy={pending} className="flex flex-col">
        <p role="status" className="sr-only">
          {status}
        </p>
        {stages.length === 0 ? (
          <p className="text-small text-text-secondary">Add a stage to start building.</p>
        ) : null}
        {stages.map((stage, si) => (
          <div key={stage.id} className="flex flex-col">
            <div
              className={`group/stage mb-1 flex flex-wrap items-baseline gap-x-2.5 gap-y-1 ${si === 0 ? "" : "mt-5"}`}
            >
              <h3 className="text-heading font-semibold">
                <span className="sr-only">Stage {si + 1}: </span>
                {stage.name}
              </h3>
              {stage.timing ? (
                <span className="text-small text-text-muted">{stage.timing}</span>
              ) : null}
              {stage.peopleHere > 0 ? (
                <span className="rounded-pill bg-accent-soft px-2 text-small text-accent-light">
                  {stage.peopleHere} {stage.peopleHere === 1 ? "person" : "people"} here
                </span>
              ) : null}
              <span className="ml-auto flex self-center opacity-60 group-focus-within/stage:opacity-100 group-hover/stage:opacity-100">
                <button
                  type="button"
                  onClick={() => startTransition(() => moveStageAction(pathwayId, stage.id, "up"))}
                  disabled={si === 0}
                  className="flex size-8 items-center justify-center rounded-button text-text-muted hover:bg-hover hover:text-text disabled:opacity-30"
                >
                  <ChevronDownIcon className="size-4 rotate-180" />
                  <span className="sr-only">Move stage {stage.name} up</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    startTransition(() => moveStageAction(pathwayId, stage.id, "down"))
                  }
                  disabled={si === stages.length - 1}
                  className="flex size-8 items-center justify-center rounded-button text-text-muted hover:bg-hover hover:text-text disabled:opacity-30"
                >
                  <ChevronDownIcon className="size-4" />
                  <span className="sr-only">Move stage {stage.name} down</span>
                </button>
                <Link
                  href={`/admin/onboarding?pathway=${pathwayId}&stage=${stage.id}`}
                  scroll={false}
                  onClick={(e) => {
                    if (!opensElsewhere(e)) {
                      e.preventDefault();
                      onSelectStage(stage.id);
                    }
                  }}
                  className="flex min-h-8 items-center rounded-button px-2 text-small text-accent-light hover:bg-hover"
                >
                  Edit<span className="sr-only"> stage {stage.name}</span>
                </Link>
              </span>
            </div>
            {stage.id === selectedStageId ? <div className="mb-2">{stagePanel}</div> : null}
            <ol className="flex flex-col">
              {slot(stage.id, 0, null)}
              {stage.steps.length === 0 ? (
                <li className="rounded-button border border-dashed border-border px-3 py-2 text-small text-text-muted">
                  Drop a step here, or add one from the library.
                </li>
              ) : null}
              {stage.steps.map((step, i) => {
                const meta = STEP_KINDS[step.kind];
                const selected = step.id === selectedStepId;
                const first = si === 0 && i === 0;
                const last = si === stages.length - 1 && i === stage.steps.length - 1;
                return (
                  <li key={step.id} className="flex flex-col">
                    <div
                      className={`rounded-card border bg-surface transition-surface ${
                        selected
                          ? "border-accent shadow-[0_0_0_1px_var(--accent)]"
                          : "border-border hover:border-border-strong"
                      }`}
                    >
                      <div
                        draggable
                        onDragStart={(e) => e.dataTransfer.setData("text/plain", `step:${step.id}`)}
                        className="group grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 p-2.5"
                      >
                        <span
                          aria-hidden="true"
                          className={`flex size-8 items-center justify-center rounded-button ${
                            selected
                              ? "bg-accent-soft text-accent-light"
                              : "bg-hover text-text-secondary"
                          }`}
                        >
                          <StepIcon kind={step.kind} className="size-4" />
                        </span>
                        <Link
                          id={`step-${step.id}`}
                          href={href(step.id)}
                          scroll={false}
                          aria-current={selected ? "true" : undefined}
                          onClick={(e) => {
                            if (!opensElsewhere(e)) {
                              e.preventDefault();
                              onSelectStep(step.id);
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
                              e.preventDefault();
                              move(step.id, e.key === "ArrowUp" ? "up" : "down", step.title);
                            }
                          }}
                          className="flex min-w-0 cursor-grab flex-col rounded-button"
                        >
                          <span className="truncate font-medium">{step.title}</span>
                          <span className="truncate text-small text-text-muted">
                            {step.summary}
                            {meta.waits ? " · Waits here" : ""}
                          </span>
                          {step.needsSetup ? (
                            <span className="mt-0.5 flex items-center gap-1.5 text-small font-medium text-warning">
                              <span
                                aria-hidden="true"
                                className="size-2 shrink-0 rounded-full bg-warning"
                              />
                              Needs setup
                              <span className="sr-only">: {step.needsSetup}</span>
                            </span>
                          ) : null}
                        </Link>
                        <span className="flex opacity-60 group-focus-within:opacity-100 group-hover:opacity-100">
                          <button
                            type="button"
                            disabled={first}
                            onClick={() => move(step.id, "up", step.title)}
                            className="flex size-8 items-center justify-center rounded-button text-text-muted hover:bg-hover hover:text-text disabled:opacity-30"
                          >
                            <ChevronDownIcon className="size-4 rotate-180" />
                            <span className="sr-only">Move {step.title} up</span>
                          </button>
                          <button
                            type="button"
                            disabled={last}
                            onClick={() => move(step.id, "down", step.title)}
                            className="flex size-8 items-center justify-center rounded-button text-text-muted hover:bg-hover hover:text-text disabled:opacity-30"
                          >
                            <ChevronDownIcon className="size-4" />
                            <span className="sr-only">Move {step.title} down</span>
                          </button>
                        </span>
                      </div>
                      {selected ? (
                        <div className="border-t border-border px-3 py-3">{stepPanel}</div>
                      ) : null}
                    </div>
                    {slot(stage.id, i + 1, step.id)}
                  </li>
                );
              })}
            </ol>
          </div>
        ))}
        <div className="mt-4 flex flex-wrap items-start gap-2">
          <button
            type="button"
            aria-expanded={libraryOpen}
            onClick={() => setLibraryOpen(!libraryOpen)}
            className={buttonClasses("primary")}
          >
            {libraryOpen ? "Close the step library" : "Add a step"}
          </button>
          {footer}
        </div>
        <p className="mt-3 text-small text-text-muted">
          Select a step to change what it does. Steps marked &ldquo;Waits here&rdquo; pause until
          they&apos;re done.
        </p>
      </section>

      {libraryOpen ? (
        <aside
          aria-label="Step library"
          className="flex flex-col gap-1.5 rounded-card border border-border bg-surface p-3 lg:sticky lg:top-6"
        >
          <h2 className="px-1 font-semibold">Step library</h2>
          <p className="px-1 text-small text-text-muted">
            Drag a step onto the pathway, or press Add to put it
            {selectedStepId ? " after the selected step" : " at the end"}.
          </p>
          {STEP_GROUPS.map((group) => (
            <div key={group} className="flex flex-col gap-1">
              <p className="mt-2 px-1 eyebrow">{group}</p>
              {(Object.keys(STEP_KINDS) as StepKind[])
                .filter((k) => STEP_KINDS[k].group === group && STEP_KINDS[k].available)
                .map((k) => (
                  <div
                    key={k}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("text/plain", `kind:${k}`)}
                    title={STEP_KINDS[k].hint}
                    className="flex cursor-grab items-center gap-2 rounded-button border border-dashed border-border bg-card py-1 pr-1 pl-1.5 text-small hover:border-accent"
                  >
                    <span
                      aria-hidden="true"
                      className="flex size-6 items-center justify-center rounded-button bg-hover text-text-secondary"
                    >
                      <StepIcon kind={k} className="size-3.5" />
                    </span>
                    <span className="flex-1">{STEP_KINDS[k].label}</span>
                    <button
                      type="button"
                      disabled={!target || pending}
                      onClick={() => target && add(k, target.stageId, target.afterStepId)}
                      className="flex min-h-8 items-center gap-0.5 rounded-button px-2 font-medium text-accent-light hover:bg-hover disabled:opacity-40"
                    >
                      Add<span className="sr-only"> {STEP_KINDS[k].label}</span>
                      <ChevronRightIcon className="size-3.5" />
                    </button>
                  </div>
                ))}
            </div>
          ))}
        </aside>
      ) : null}
    </div>
  );
}

/** Ctrl, Cmd, Shift or middle click opens the link in a new tab or window, as usual. */
function opensElsewhere(event: {
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  button: number;
}) {
  return event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0;
}
