// The Serve sheet on phones (sheet B, G 2026-11-13): your next service first, then Copyright and
// SOPs with what's there now. Pure rules, so the native apps can reuse them.

import { TIME_ZONE } from "./time-zone";

export type ServeSheetService = {
  id: string;
  title: string;
  startsAt: string;
  /** The positions you're scheduled in; empty when you're not on the team for it. */
  positions: string[];
  done: number;
  total: number;
};

export type ServeSheetSummary = {
  service: ServeSheetService | null;
  sopsUpdatedThisWeek: number;
  /** Null for anyone who isn't a copyright reviewer. */
  copyright: { waiting: number; firstDay: string | null } | null;
};

/**
 * How far along the checklist is: your own checklists when you're scheduled and have some,
 * otherwise every checklist for the service, as the checklist page shows them.
 */
export function checklistProgress(
  checklists: readonly { isMine: boolean; done: number; total: number }[],
  scheduled: boolean,
): { done: number; total: number } {
  const mine = checklists.filter((checklist) => checklist.isMine);
  const counted = scheduled && mine.length > 0 ? mine : checklists;
  return counted.reduce(
    (sum, checklist) => ({ done: sum.done + checklist.done, total: sum.total + checklist.total }),
    { done: 0, total: 0 },
  );
}

const DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  weekday: "long",
  day: "numeric",
  month: "short",
});
const TIME = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  hour: "numeric",
  minute: "2-digit",
});

/** "Sunday 22 Nov" in Winnipeg time. */
export function serviceDay(iso: string): string {
  const parts = DAY.formatToParts(new Date(iso));
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("weekday")} ${part("day")} ${part("month").replace(".", "")}`;
}

/** "10:00 a.m." in Winnipeg time. */
export function serviceTime(iso: string): string {
  return TIME.format(new Date(iso));
}

/** The card's heading: "Sunday 22 Nov · Camera 2", or the day alone when you're not on it. */
export function serviceHeading(service: ServeSheetService): string {
  const day = serviceDay(service.startsAt);
  return service.positions.length > 0 ? `${day} · ${service.positions.join(", ")}` : day;
}

/** The line under it: when it starts, and how far along the checklist is. */
export function serviceProgressLine(service: ServeSheetService): string {
  const starts = `Starts ${serviceTime(service.startsAt)}`;
  if (service.total === 0) {
    return `${starts} · No checklist yet`;
  }
  const noun = service.positions.length > 0 ? "jobs" : "checks";
  return `${starts} · ${service.done} of ${service.total} ${noun} done`;
}

/** "2 waiting · first for Sunday 22 Nov", or "Nothing waiting". */
export function copyrightLine(copyright: { waiting: number; firstDay: string | null }): string {
  if (copyright.waiting === 0) {
    return "Nothing waiting";
  }
  const first = copyright.firstDay
    ? ` · first for ${serviceDay(`${copyright.firstDay}T18:00:00Z`)}`
    : "";
  return `${copyright.waiting} waiting${first}`;
}

/** "2 updated this week", or what the SOPs are for. */
export function sopsLine(updatedThisWeek: number): string {
  if (updatedThisWeek === 0) {
    return "How we do things";
  }
  return `${updatedThisWeek} updated this week`;
}
