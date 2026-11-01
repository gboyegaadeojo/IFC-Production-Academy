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
  | "unknown";

const KNOWN: ReadonlySet<string> = new Set<ChecklistError>([
  "not_authorized",
  "checklist_closed",
  "item_not_found",
  "nothing_to_undo",
  "nothing_to_reset",
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
    case "unknown":
      return "That didn't save. Check your connection and try again.";
  }
}

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
