"use client";

import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";
import {
  buildRun,
  clockLabel,
  countdownLabel,
  type PlanItem,
  type RunEntry,
  runProgress,
  type RunProgress,
} from "@/lib/domain/service-dashboard";

type Clock = { run: RunEntry[]; progress: RunProgress };

const ClockContext = createContext<Clock | null>(null);

/**
 * One clock for the tiles that follow the plan (ADD-DASH-05): it ticks each second and works out
 * where the service should be from the plan's times. Live slide tracking comes with the bridge.
 */
export function ServiceClock({
  items,
  startsAt,
  renderedAt,
  children,
}: {
  items: PlanItem[];
  startsAt: string;
  /** The time on the server, so the first paint matches. */
  renderedAt: number;
  children: ReactNode;
}) {
  const [now, setNow] = useState(renderedAt);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, []);
  const run = useMemo(() => buildRun(items, Date.parse(startsAt)), [items, startsAt]);
  const value = useMemo(() => ({ run, progress: runProgress(run, now) }), [run, now]);
  return <ClockContext.Provider value={value}>{children}</ClockContext.Provider>;
}

function useClock(): Clock {
  const clock = useContext(ClockContext);
  if (!clock) {
    throw new Error("Service Dashboard tiles need a ServiceClock.");
  }
  return clock;
}

const NO_PLAN = "No run of service yet. It comes from the plan in Planning Center.";

export function RunOfServiceTile() {
  const { run, progress } = useClock();
  if (run.length === 0) {
    return <p className="text-small text-text-secondary">{NO_PLAN}</p>;
  }
  return (
    <ol className="flex flex-col">
      {run.map((entry) =>
        entry.isHeader ? (
          <li key={entry.id} className="pt-2 pb-0.5 eyebrow text-text-muted">
            {entry.title}
          </li>
        ) : (
          <RunRow
            key={entry.id}
            entry={entry}
            isNow={progress.current?.id === entry.id}
            isDone={progress.state === "after" || entry.endsAt <= progress.now}
          />
        ),
      )}
    </ol>
  );
}

function RunRow({ entry, isNow, isDone }: { entry: RunEntry; isNow: boolean; isDone: boolean }) {
  return (
    <li
      aria-current={isNow ? "true" : undefined}
      data-now={isNow ? "true" : undefined}
      className={`rounded-button border px-2 py-1 text-small ${
        isNow ? "border-success-line bg-success-soft font-medium" : "border-transparent"
      }`}
    >
      <div className="grid grid-cols-[4.25rem_minmax(0,1fr)_auto] items-baseline gap-2">
        <span className="text-text-muted tabular-nums">{clockLabel(entry.startsAt)}</span>
        <span className={isDone && !isNow ? "text-text-muted" : ""}>
          {entry.title} {isNow ? <span className="text-small font-bold">NOW</span> : null}
        </span>
        <span className="text-text-muted tabular-nums">{countdownLabel(entry.lengthSeconds)}</span>
      </div>
      {entry.notes.map((note, index) => (
        <p key={index} className="pl-[4.75rem] text-small text-text-secondary">
          {note.category ? `${note.category}: ` : ""}
          {note.content}
        </p>
      ))}
    </li>
  );
}

export function CurrentItemTile() {
  const { run, progress } = useClock();
  if (run.length === 0) {
    return <p className="text-small text-text-secondary">{NO_PLAN}</p>;
  }
  if (progress.state === "before") {
    return (
      <>
        <p className="font-mono text-title font-bold tabular-nums">
          {countdownLabel(progress.untilStartSeconds)}
        </p>
        <p className="text-small text-text-secondary">
          Until {progress.next?.title ?? "the start"}
        </p>
      </>
    );
  }
  if (progress.state === "after" || !progress.current) {
    return <p className="text-small text-text-secondary">The plan has finished.</p>;
  }
  const { current, next } = progress;
  const left = progress.itemLeftSeconds;
  const done = current.lengthSeconds > 0 ? 100 - (left / current.lengthSeconds) * 100 : 100;
  return (
    <>
      <p className="flex flex-wrap items-baseline gap-3">
        <span className="font-mono text-title font-bold text-success tabular-nums">
          {countdownLabel(left)}
        </span>
        <strong className="font-medium">{current.title}</strong>
      </p>
      <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-pill bg-hover">
        <div className="h-full rounded-pill bg-success" style={{ width: `${done}%` }} />
      </div>
      <p className="text-small text-text-muted">
        {next ? `Next: ${next.title} (${countdownLabel(next.lengthSeconds)})` : "Last item"}. Going
        by the plan&apos;s clock.
      </p>
    </>
  );
}

export function ServiceTimerTile() {
  const { run, progress } = useClock();
  if (run.length === 0) {
    return <p className="text-small text-text-secondary">{NO_PLAN}</p>;
  }
  return (
    <>
      <p className="eyebrow text-text-muted">Time left</p>
      <p className="font-mono text-title font-bold text-error tabular-nums">
        {countdownLabel(progress.serviceLeftSeconds)}
      </p>
      <p className="text-small text-text-muted">Ends {clockLabel(progress.endsAt)}</p>
    </>
  );
}

/** The current item in the header, so it can be seen from anywhere on the page. */
export function CurrentItemName() {
  const { progress } = useClock();
  return <>{progress.current?.title ?? progress.next?.title ?? "Nothing running"}</>;
}
