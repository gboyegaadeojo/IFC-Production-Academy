/**
 * Assigning a course from its page (ADD-REPORT-03; course page Actions menu, option 1, approved
 * 2026-11-07). The due date is optional and only a date to aim for: missing it never blocks anything.
 */

import { TIME_ZONE } from "./time-zone";

/** Dates are "YYYY-MM-DD", the day in Winnipeg. */
const WINNIPEG_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function winnipegToday(now: Date = new Date()): string {
  return WINNIPEG_DAY.format(now);
}

function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** The quick choices: the coming Sunday (next week's on a Sunday), and two weeks from today. */
export function dueDateChoices(today: string): { thisSunday: string; inTwoWeeks: string } {
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
  return { thisSunday: addDays(today, 7 - weekday), inTwoWeeks: addDays(today, 14) };
}

const DUE = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  weekday: "short",
  month: "short",
  day: "numeric",
});

/** "Sun, Nov 8". A due date is a calendar day, so no time zone moves it. */
export function formatDueDate(day: string): string {
  return DUE.format(new Date(`${day}T00:00:00Z`));
}

/** Someone a leader can assign, with the line under their name. */
export type Assignee = { userId: string; name: string; note: string | null; dueOn: string | null };

export type AssigneeFacts = {
  assigned: boolean;
  dueOn: string | null;
  lessonsDone: number;
  totalLessons: number;
};

/** The line under a name: whether they're already assigned, and how far through they are. */
export function assigneeNote(facts: AssigneeFacts): string | null {
  if (facts.assigned) {
    return facts.dueOn
      ? `Already assigned · due ${formatDueDate(facts.dueOn)}`
      : "Already assigned";
  }
  if (facts.totalLessons > 0 && facts.lessonsDone >= facts.totalLessons) {
    return "All lessons done";
  }
  return facts.lessonsDone > 0 ? `${facts.lessonsDone} of ${facts.totalLessons} lessons` : null;
}

export type AssignOutcome = "assigned" | "updated" | "unchanged";

/** What the leader is told afterwards. */
export function assignedMessage(
  outcome: AssignOutcome,
  name: string,
  dueOn: string | null,
): string {
  const due = dueOn ? `, due ${formatDueDate(dueOn)}` : "";
  if (outcome === "assigned") {
    return `Assigned to ${name}${due}. They'll see it on Training.`;
  }
  if (outcome === "updated") {
    return dueOn
      ? `${name} was already assigned. The due date is now ${formatDueDate(dueOn)}.`
      : `${name} was already assigned. There's no due date now.`;
  }
  return `${name} is already assigned${due}.`;
}
