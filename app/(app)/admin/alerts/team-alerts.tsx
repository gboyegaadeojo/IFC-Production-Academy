"use client";

import { useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import {
  ALERT_SHOWN_LABELS,
  inTeamFilter,
  type AlertShown,
  type TeamFilter,
} from "@/lib/domain/alerts";

export type TeamPerson = {
  userId: string;
  displayName: string;
  departments: string[];
  /** "iPhone", "Android": where they've opened the installed app. */
  appOn: string[];
  shown: AlertShown;
  /** Devices with alerts on: "iPhone". */
  devices: string[];
  /** Groups with an alert switched off for their phone: "Training". */
  offGroups: string[];
};

const FILTERS: { key: TeamFilter; label: string }[] = [
  { key: "all", label: "Everyone" },
  { key: "no_app", label: "No app" },
  { key: "not_on", label: "Alerts not on" },
  { key: "some_off", label: "Some alerts off" },
  { key: "cannot", label: "Phone can't" },
];

// Colour and a mark together, so colour is never the only signal (SPEC §6).
const PILL: Record<"good" | "some" | "bad" | "quiet", { className: string; mark: string }> = {
  good: { className: "bg-success-soft text-success", mark: "✓" },
  some: { className: "bg-warning-soft text-warning", mark: "◐" },
  bad: { className: "bg-error/10 text-error", mark: "!" },
  quiet: { className: "bg-hover text-text-secondary", mark: "–" },
};
const ALERT_TONE: Record<AlertShown, keyof typeof PILL> = {
  on: "good",
  some: "some",
  off: "bad",
  computer_only: "bad",
  cannot: "quiet",
};

function Pill({
  tone,
  label,
  wide = false,
}: {
  tone: keyof typeof PILL;
  label: string;
  wide?: boolean;
}) {
  const pill = PILL[tone];
  return (
    <span
      className={`inline-flex h-6 items-center gap-1.5 rounded-pill px-2.5 text-[0.75rem] font-semibold ${pill.className} ${
        wide ? "w-full justify-between" : "w-fit"
      }`}
    >
      <span>{label}</span>
      <span aria-hidden="true">{pill.mark}</span>
    </span>
  );
}

/** A note worth knowing, or nothing: "Off for: Training", "Gets emails instead". */
function note(person: TeamPerson): string {
  if (person.shown === "some") {
    return `Off for: ${person.offGroups.join(", ")}`;
  }
  if (person.shown === "cannot") {
    return "Gets emails instead";
  }
  if (person.shown === "computer_only") {
    return "On a computer, not a phone";
  }
  return "";
}

/**
 * The leaders' list (mock approved 2026-11-10): numbers at the top, filters, and for each person
 * whether they have the app and their alerts. A table on a computer, one short row each on a phone.
 */
export function TeamAlerts({ people }: { people: TeamPerson[] }) {
  const [filter, setFilter] = useState<TeamFilter>("all");
  const withApp = people.map((p) => ({ ...p, hasApp: p.appOn.length > 0 }));
  const shown = withApp.filter((p) => inTeamFilter(filter, p));
  const stats = [
    { label: "have the app", value: withApp.filter((p) => p.hasApp).length },
    { label: "alerts on", value: withApp.filter((p) => p.shown === "on").length },
    { label: "some alerts off", value: withApp.filter((p) => p.shown === "some").length },
    {
      label: "alerts not on",
      value: withApp.filter((p) => inTeamFilter("not_on", p)).length,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <ul aria-label="At a glance" className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
        {stats.map((stat) => (
          <li
            key={stat.label}
            className="flex flex-col rounded-card border border-border bg-surface px-4 py-3"
          >
            <span className="text-title font-bold">
              {stat.value}
              <span className="text-body font-medium text-text-muted"> of {people.length}</span>
            </span>
            <span className="text-small text-text-secondary">{stat.label}</span>
          </li>
        ))}
      </ul>

      <div role="group" aria-label="Show" className="flex gap-1.5 overflow-x-auto pb-0.5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            aria-pressed={filter === f.key}
            onClick={() => setFilter(f.key)}
            className="min-h-control shrink-0 rounded-pill border border-border bg-surface px-3 text-small font-semibold text-text-secondary transition-surface aria-pressed:border-text aria-pressed:bg-text aria-pressed:text-bg"
          >
            {f.label} · {withApp.filter((p) => inTeamFilter(f.key, p)).length}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="rounded-card border border-dashed border-border p-6 text-center text-small text-text-secondary">
          Nobody here.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">
          <li
            aria-hidden="true"
            className="hidden grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.2fr)] gap-3 px-4 py-2.5 text-[0.6875rem] font-semibold tracking-[0.04em] text-text-muted uppercase md:grid"
          >
            <span>Person</span>
            <span>App on their phone</span>
            <span>Alerts</span>
          </li>
          {shown.map((person) => {
            const hasNote = note(person);
            const appLabel = person.hasApp ? "Installed" : "Not installed";
            const alertLabel = ALERT_SHOWN_LABELS[person.shown];
            return (
              <li
                key={person.userId}
                className="flex items-center gap-3 px-3 py-2.5 md:grid md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.2fr)] md:px-4 md:py-3"
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar name={person.displayName} />
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate font-semibold">{person.displayName}</span>
                    <span className="truncate text-small text-text-muted">
                      {person.departments.join(", ")}
                    </span>
                    {hasNote ? (
                      <span className="text-small font-medium text-text-secondary md:hidden">
                        {hasNote}
                      </span>
                    ) : null}
                  </div>
                </div>
                {/* Phones: two small pills, App and Alerts. */}
                <div className="flex w-24 shrink-0 flex-col gap-1 md:hidden">
                  <span className="sr-only">
                    App: {appLabel}. Alerts: {alertLabel}.
                  </span>
                  <span aria-hidden="true" className="flex flex-col gap-1">
                    <Pill tone={person.hasApp ? "good" : "quiet"} label="App" wide />
                    <Pill tone={ALERT_TONE[person.shown]} label="Alerts" wide />
                  </span>
                </div>
                {/* Computers: a column each, with what kind of device. */}
                <div className="hidden flex-col gap-1 md:flex">
                  <Pill tone={person.hasApp ? "good" : "quiet"} label={appLabel} />
                  <span className="text-small text-text-muted">
                    {person.hasApp ? person.appOn.join(", ") : "Uses the website"}
                  </span>
                </div>
                <div className="hidden flex-col gap-1 md:flex">
                  <Pill tone={ALERT_TONE[person.shown]} label={alertLabel} />
                  <span className="text-small text-text-muted">
                    {hasNote || person.devices.join(", ")}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
