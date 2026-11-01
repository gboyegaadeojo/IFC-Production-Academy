/**
 * Pre-service checklists (decision record 9, stage 2), from IFC's Sunday Pre-Service Checklist.
 * Pure rules: reading a pasted list, grouping a service's checklists, progress, and wording. The
 * database decides who may tick, reset, or edit.
 */

export const MAX_ITEM_LENGTH = 300;
export const MAX_SECTION_LENGTH = 120;

export type ParsedSection = { name: string; items: string[] };

/**
 * Turns pasted text into sections and items. A line starting with "#" starts a section; every
 * other non-empty line is an item, with any "-", "*", "•", "[ ]", or "1." in front removed. Items
 * before the first heading go in "General". Over-long lines are cut to fit.
 */
export function parseChecklistText(text: string): ParsedSection[] {
  const sections: ParsedSection[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+/g, " ").trim();
    if (!line) {
      continue;
    }
    const heading = /^#+\s*(.+)$/.exec(line);
    if (heading) {
      sections.push({ name: heading[1]!.slice(0, MAX_SECTION_LENGTH), items: [] });
      continue;
    }
    const item = line
      .replace(/^(?:[-*•]\s*)?(?:\[[ xX]?\]\s*)?(?:\d+[.)]\s+)?/, "")
      .trim()
      .slice(0, MAX_ITEM_LENGTH);
    if (!item) {
      continue;
    }
    if (sections.length === 0) {
      sections.push({ name: "General", items: [] });
    }
    sections.at(-1)!.items.push(item);
  }
  return sections.filter((section) => section.items.length > 0);
}

export type ServiceChecklistRow = {
  checklistId: string;
  checklistName: string;
  departmentName: string;
  isMine: boolean;
  sectionId: string;
  sectionName: string;
  itemId: string;
  itemText: string;
  checkedByName: string | null;
  checkedAt: string | null;
};

export type ServiceChecklist = {
  id: string;
  name: string;
  departmentName: string;
  isMine: boolean;
  done: number;
  total: number;
  sections: {
    id: string;
    name: string;
    items: { id: string; text: string; checkedByName: string | null; checkedAt: string | null }[];
  }[];
};

/** Rows from event_checklists, in order, grouped into checklists and sections. */
export function groupServiceChecklists(rows: readonly ServiceChecklistRow[]): ServiceChecklist[] {
  const checklists: ServiceChecklist[] = [];
  for (const row of rows) {
    let checklist = checklists.find((c) => c.id === row.checklistId);
    if (!checklist) {
      checklist = {
        id: row.checklistId,
        name: row.checklistName,
        departmentName: row.departmentName,
        isMine: row.isMine,
        done: 0,
        total: 0,
        sections: [],
      };
      checklists.push(checklist);
    }
    let section = checklist.sections.find((s) => s.id === row.sectionId);
    if (!section) {
      section = { id: row.sectionId, name: row.sectionName, items: [] };
      checklist.sections.push(section);
    }
    section.items.push({
      id: row.itemId,
      text: row.itemText,
      checkedByName: row.checkedByName,
      checkedAt: row.checkedAt,
    });
    checklist.total += 1;
    if (row.checkedAt) {
      checklist.done += 1;
    }
  }
  return checklists;
}

/** "12 of 20 done" */
export function progressLabel(done: number, total: number): string {
  return total > 0 && done === total ? "All done" : `${done} of ${total} done`;
}

export function percentDone(done: number, total: number): number {
  return total === 0 ? 0 : Math.round((done * 100) / total);
}

/** What ticking an item returns to the page. */
export type TickResult = { ok: true } | { ok: false; message: string };

export type ChecklistError =
  | "not_authorized"
  | "checklist_closed"
  | "item_not_found"
  | "nothing_to_undo"
  | "nothing_to_reset"
  | "name_taken"
  | "list_hidden"
  | "list_not_found"
  | "list_in_use"
  | "service_has_checkoffs"
  | "move_not_allowed"
  | "parent_hidden"
  | "invalid_settings"
  | "unknown";

const KNOWN: ReadonlySet<string> = new Set<ChecklistError>([
  "not_authorized",
  "checklist_closed",
  "item_not_found",
  "nothing_to_undo",
  "nothing_to_reset",
  "name_taken",
  "list_hidden",
  "list_not_found",
  "list_in_use",
  "service_has_checkoffs",
  "move_not_allowed",
  "parent_hidden",
  "invalid_settings",
]);

export function toChecklistError(
  error: { code?: string | null; message?: string | null } | null | undefined,
): ChecklistError {
  if (error?.message && KNOWN.has(error.message)) {
    return error.message as ChecklistError;
  }
  return error?.code === "42501" ? "not_authorized" : "unknown";
}

export function checklistErrorMessage(error: ChecklistError): string {
  switch (error) {
    case "not_authorized":
      return "Only the media team, and whoever leads the service, can do that.";
    case "checklist_closed":
      return "This checklist opens two days before the service and closes after it.";
    case "item_not_found":
      return "That item has been removed from the checklist.";
    case "nothing_to_undo":
      return "There's no reset to undo.";
    case "nothing_to_reset":
      return "Nothing is ticked, so there's nothing to reset.";
    case "name_taken":
      return "Another task list already has that name. Choose a different one.";
    case "list_hidden":
      return "That task list is hidden. Restore it first.";
    case "list_not_found":
      return "That task list isn't available.";
    case "list_in_use":
      return "The default list, and a list a service is using, can't be hidden.";
    case "service_has_checkoffs":
      return "Something is already ticked for the current service, so it keeps its list.";
    case "move_not_allowed":
      return "That can only move to a section or checklist that isn't hidden, in the same task list.";
    case "parent_hidden":
      return "What it belongs to is hidden. Restore that too, or restore it first.";
    case "invalid_settings":
      return "Choose a service type from Planning Center and a day of the week.";
    case "unknown":
      return "That didn't save. Check your connection and try again.";
  }
}

// ---------------------------------------------------------------------------
// Task lists (checklist app US-11)
// ---------------------------------------------------------------------------

export const MAX_LIST_NAME_LENGTH = 80;
export const MAX_LIST_DESCRIPTION_LENGTH = 300;

/** A list name as it's stored: trimmed, with runs of spaces made one. */
export function tidyListName(name: string): string {
  return name.replace(/\s+/g, " ").trim();
}

/** List names clash when they match ignoring capitals and extra spaces. */
export function sameListName(a: string, b: string): boolean {
  return tidyListName(a).toLowerCase() === tidyListName(b).toLowerCase();
}

export type TaskList = {
  id: string;
  name: string;
  description: string;
  isDefault: boolean;
  hiddenAt: string | null;
  checklists: number;
  items: number;
  inUse: boolean;
};

/** Why a list can't be hidden, or null if it can. */
export function hideBlocker(list: Pick<TaskList, "isDefault" | "inUse">): string | null {
  if (list.isDefault) {
    return "This is the default list. Make another list the default first.";
  }
  return list.inUse ? "A current or upcoming service is using this list." : null;
}

/** Whether "Also use it for the current service" can be offered when making a list the default. */
export function canSwitchCurrentService(
  current: { setId: string; hasCheckoffs: boolean } | null,
  listId: string,
): boolean {
  return current !== null && current.setId !== listId && !current.hasCheckoffs;
}

// ---------------------------------------------------------------------------
// Hidden items and restructuring (checklist app US-12, US-12a, US-13, US-13a)
// ---------------------------------------------------------------------------

export type HiddenKind = "checklist" | "section" | "item";

export type HiddenItem = {
  kind: HiddenKind;
  id: string;
  name: string;
  /** Where it was: the department for a checklist, the checklist (and section) otherwise. */
  place: string;
  hiddenAt: string;
  parentHidden: boolean;
};

const KIND_LABELS: Record<HiddenKind, string> = {
  checklist: "Department checklist",
  section: "Section",
  item: "Task",
};

export function hiddenKindLabel(kind: HiddenKind): string {
  return KIND_LABELS[kind];
}

/** What a restore brings back with it, when what it belongs to is hidden too. */
export function restoreWithParentsLabel(kind: HiddenKind): string {
  return kind === "item"
    ? "Restore it with its section and checklist"
    : "Restore it with its checklist";
}

/** The warning before hiding something that still has tasks in it. */
export function removeWarning(kind: "checklist" | "section", tasks: number, positions = 0): string {
  const parts = [
    tasks > 0
      ? `Its ${tasks} ${tasks === 1 ? "task goes" : "tasks go"} with it.`
      : "It has no tasks.",
  ];
  if (kind === "checklist" && positions > 0) {
    parts.push(
      `Its ${positions === 1 ? "link to a position is" : `links to ${positions} positions are`} removed, and not restored if you bring it back.`,
    );
  }
  parts.push(
    "It disappears from current and future checklists. Past services keep their records, and you can restore it from Hidden items.",
  );
  return parts.join(" ");
}

// ---------------------------------------------------------------------------
// Settings (checklist app US-07, US-11a, US-15)
// ---------------------------------------------------------------------------

export const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

/**
 * The next service day on or after a date ("YYYY-MM-DD"), as the database works it out when
 * nothing is published: today, if today is the service day.
 */
export function nextServiceDay(today: string, weekday: number): string {
  const date = new Date(`${today}T12:00:00Z`);
  const ahead = (((weekday - date.getUTCDay()) % 7) + 7) % 7;
  date.setUTCDate(date.getUTCDate() + ahead);
  return date.toISOString().slice(0, 10);
}

/** The note on a service day the checklist opened before Planning Center published a plan. */
export const NOT_PUBLISHED_NOTE =
  "No service is published in Planning Center yet. Your checklist is ready when you are.";

// ---------------------------------------------------------------------------
// The activity log (checklist app US-07a, US-13b)
// ---------------------------------------------------------------------------

export const ACTIVITY_ACTIONS: Record<string, string> = {
  check: "Ticked",
  uncheck: "Unticked",
  reset: "Reset the service's checklists",
  undo_reset: "Undid the reset",
  add: "Added",
  rename: "Renamed",
  edit: "Edited",
  hide: "Hid",
  restore: "Restored",
  move: "Moved",
  reorder: "Reordered",
  remove: "Removed",
  link_position: "Linked a position",
  unlink_position: "Unlinked a position",
  set_default: "Made the default list",
  settings: "Changed the checklist settings",
  switch_service_list: "Switched the current service to",
};

export function activityActionLabel(action: string): string {
  return ACTIVITY_ACTIONS[action] ?? action.replaceAll("_", " ");
}

/** "Refused: …", "No change", or nothing for a change that went through. */
export function activityOutcomeLabel(outcome: string, reason: string | null): string | null {
  if (outcome === "refused") {
    return `Refused: ${checklistErrorMessage(toChecklistError({ message: reason }))}`;
  }
  return outcome === "unchanged" ? "No change" : null;
}

/** The words that changed, old to new, for an edit: "Power on" → "Power on everything". */
export function activityChange(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): string | null {
  for (const field of ["text", "name"]) {
    const was = before?.[field];
    const now = after?.[field];
    if (typeof was === "string" && typeof now === "string" && was !== now) {
      return `“${was}” → “${now}”`;
    }
  }
  if (typeof after?.cleared === "number") {
    return `${after.cleared} ${after.cleared === 1 ? "tick" : "ticks"} cleared`;
  }
  if (typeof after?.restored === "number") {
    return `${after.restored} ${after.restored === 1 ? "tick" : "ticks"} restored`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Service history (checklist app US-07b)
// ---------------------------------------------------------------------------

export type RecordRow = {
  checklistId: string;
  checklistName: string;
  sectionName: string;
  itemId: string;
  itemText: string;
  checkedText: string | null;
  checkedByName: string | null;
  checkedAt: string | null;
  removedAt: string | null;
};

export type RecordTask = {
  id: string;
  text: string;
  /** The text it was ticked under, when that differs from the record. */
  checkedUnder: string | null;
  section: string;
  checkedByName: string | null;
  checkedAt: string | null;
  removedAt: string | null;
};

export type RecordDepartment = {
  id: string;
  name: string;
  done: number;
  total: number;
  notDone: RecordTask[];
  doneTasks: RecordTask[];
  removed: RecordTask[];
};

/**
 * A service's record by department: "X of Y done", what wasn't ticked, what was, and what was
 * removed during the service (not counted).
 */
export function groupServiceRecord(rows: readonly RecordRow[]): {
  done: number;
  total: number;
  departments: RecordDepartment[];
} {
  const departments: RecordDepartment[] = [];
  for (const row of rows) {
    let department = departments.find((d) => d.id === row.checklistId);
    if (!department) {
      department = {
        id: row.checklistId,
        name: row.checklistName,
        done: 0,
        total: 0,
        notDone: [],
        doneTasks: [],
        removed: [],
      };
      departments.push(department);
    }
    const task: RecordTask = {
      id: row.itemId,
      text: row.itemText,
      checkedUnder: row.checkedText && row.checkedText !== row.itemText ? row.checkedText : null,
      section: row.sectionName,
      checkedByName: row.checkedByName,
      checkedAt: row.checkedAt,
      removedAt: row.removedAt,
    };
    if (row.removedAt) {
      department.removed.push(task);
      continue;
    }
    department.total += 1;
    if (row.checkedAt) {
      department.done += 1;
      department.doneTasks.push(task);
    } else {
      department.notDone.push(task);
    }
  }
  return {
    done: departments.reduce((sum, d) => sum + d.done, 0),
    total: departments.reduce((sum, d) => sum + d.total, 0),
    departments,
  };
}
