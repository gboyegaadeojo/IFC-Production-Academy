"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { FormState } from "@/components/ui/action-form";
import { getAdminAccess } from "@/lib/data/admin/access";
import * as checklists from "@/lib/data/checklists";
import {
  checklistErrorMessage,
  MAX_ITEM_LENGTH,
  MAX_LIST_DESCRIPTION_LENGTH,
  MAX_LIST_NAME_LENGTH,
  MAX_SECTION_LENGTH,
  parseChecklistText,
} from "@/lib/domain/checklists";

// Editing pre-service checklists (decision record 9, stage 2). Row-level security checks
// checklist.manage for the checklist's department on every write.

const id = z.uuid();
const text = (value: FormDataEntryValue | null) => (typeof value === "string" ? value : "");
const name = (max: number, message: string) =>
  z
    .string()
    .transform((value) => value.replace(/\s+/g, " ").trim())
    .pipe(z.string().min(1, message).max(max, `Keep it under ${max} characters.`));

function error(message: string): FormState {
  return { status: "error", message };
}
function done(message: string): FormState {
  refresh();
  return { status: "done", message };
}
async function allowed(): Promise<boolean> {
  return (await getAdminAccess("checklists")).allowed;
}
const denied = () => error(checklistErrorMessage("not_authorized"));

export async function createChecklistAction(_: FormState, formData: FormData): Promise<FormState> {
  const departmentId = id.safeParse(formData.get("departmentId"));
  const listId = id.safeParse(formData.get("listId"));
  const title = name(80, "Give the checklist a name.").safeParse(text(formData.get("name")));
  if (!departmentId.success) {
    return error("Choose a department.");
  }
  if (!listId.success) {
    return error("Choose a task list.");
  }
  if (!title.success) {
    return error(title.error.issues[0]?.message ?? "Give the checklist a name.");
  }
  if (!(await allowed())) {
    return denied();
  }
  const result = await checklists.createChecklist(departmentId.data, title.data, listId.data);
  if (!result.ok) {
    return error(checklistErrorMessage(result.error));
  }
  redirect(`/admin/checklists/${result.value}`);
}

export async function renameChecklistAction(_: FormState, formData: FormData): Promise<FormState> {
  const checklistId = id.safeParse(formData.get("checklistId"));
  const title = name(80, "Give the checklist a name.").safeParse(text(formData.get("name")));
  if (!checklistId.success || !(await allowed())) {
    return denied();
  }
  if (!title.success) {
    return error(title.error.issues[0]?.message ?? "Give the checklist a name.");
  }
  const result = await checklists.renameChecklist(checklistId.data, title.data);
  return result.ok ? done("Renamed.") : error(checklistErrorMessage(result.error));
}

export async function archiveChecklistAction(_: FormState, formData: FormData): Promise<FormState> {
  const checklistId = id.safeParse(formData.get("checklistId"));
  if (!checklistId.success || !(await allowed())) {
    return denied();
  }
  const result = await checklists.archiveChecklist(checklistId.data);
  if (!result.ok) {
    return error(checklistErrorMessage(result.error));
  }
  redirect("/admin/checklists");
}

export async function setPositionsAction(_: FormState, formData: FormData): Promise<FormState> {
  const checklistId = id.safeParse(formData.get("checklistId"));
  const roleIds = z.array(z.uuid()).safeParse(formData.getAll("roleId"));
  if (!checklistId.success || !roleIds.success || !(await allowed())) {
    return denied();
  }
  const result = await checklists.setChecklistPositions(checklistId.data, roleIds.data);
  return result.ok
    ? done("Saved. People scheduled in these positions see this checklist first.")
    : error(checklistErrorMessage(result.error));
}

export async function addSectionAction(_: FormState, formData: FormData): Promise<FormState> {
  const checklistId = id.safeParse(formData.get("checklistId"));
  const title = name(MAX_SECTION_LENGTH, "Name the section.").safeParse(text(formData.get("name")));
  if (!checklistId.success || !(await allowed())) {
    return denied();
  }
  if (!title.success) {
    return error(title.error.issues[0]?.message ?? "Name the section.");
  }
  const result = await checklists.addSection(checklistId.data, title.data);
  return result.ok ? done("Section added.") : error(checklistErrorMessage(result.error));
}

const sectionChange = z.discriminatedUnion("op", [
  z.object({ op: z.literal("rename"), name: name(MAX_SECTION_LENGTH, "Name the section.") }),
  z.object({ op: z.literal("remove") }),
  z.object({ op: z.literal("add-item"), text: name(MAX_ITEM_LENGTH, "Write the item.") }),
]);

export async function sectionAction(_: FormState, formData: FormData): Promise<FormState> {
  const sectionId = id.safeParse(formData.get("sectionId"));
  const change = sectionChange.safeParse({
    op: formData.get("op"),
    name: text(formData.get("name")),
    text: text(formData.get("text")),
  });
  if (!sectionId.success || !(await allowed())) {
    return denied();
  }
  if (!change.success) {
    return error(change.error.issues[0]?.message ?? "Check what you entered.");
  }
  const result =
    change.data.op === "rename"
      ? await checklists.updateSection(sectionId.data, { name: change.data.name })
      : change.data.op === "remove"
        ? await checklists.updateSection(sectionId.data, { archived: true })
        : await checklists.addItem(sectionId.data, change.data.text);
  if (!result.ok) {
    return error(checklistErrorMessage(result.error));
  }
  return done(
    change.data.op === "rename"
      ? "Renamed."
      : change.data.op === "remove"
        ? "Section removed. Past services keep what was ticked."
        : "Item added.",
  );
}

const itemChange = z.discriminatedUnion("op", [
  z.object({ op: z.literal("edit"), text: name(MAX_ITEM_LENGTH, "Write the item.") }),
  z.object({ op: z.literal("remove") }),
]);

export async function itemAction(_: FormState, formData: FormData): Promise<FormState> {
  const itemId = id.safeParse(formData.get("itemId"));
  const change = itemChange.safeParse({ op: formData.get("op"), text: text(formData.get("text")) });
  if (!itemId.success || !(await allowed())) {
    return denied();
  }
  if (!change.success) {
    return error(change.error.issues[0]?.message ?? "Check what you entered.");
  }
  const result =
    change.data.op === "edit"
      ? await checklists.updateItem(itemId.data, { text: change.data.text })
      : await checklists.updateItem(itemId.data, { archived: true });
  if (!result.ok) {
    return error(checklistErrorMessage(result.error));
  }
  return done(
    change.data.op === "edit" ? "Saved." : "Item removed. Past services keep what was ticked.",
  );
}

const move = z.object({
  table: z.enum(["checklist_sections", "checklist_items"]),
  aId: z.uuid(),
  aOrder: z.coerce.number().int(),
  bId: z.uuid(),
  bOrder: z.coerce.number().int(),
});

/** Swaps two neighbours, for Move up and Move down. */
export async function moveAction(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = move.safeParse({
    table: formData.get("table"),
    aId: formData.get("aId"),
    aOrder: formData.get("aOrder"),
    bId: formData.get("bId"),
    bOrder: formData.get("bOrder"),
  });
  if (!parsed.success || !(await allowed())) {
    return denied();
  }
  const result = await checklists.swapOrder(
    parsed.data.table,
    { id: parsed.data.aId, sortOrder: parsed.data.aOrder },
    { id: parsed.data.bId, sortOrder: parsed.data.bOrder },
  );
  return result.ok ? done("Moved.") : error(checklistErrorMessage(result.error));
}

export async function importAction(_: FormState, formData: FormData): Promise<FormState> {
  const checklistId = id.safeParse(formData.get("checklistId"));
  const pasted = text(formData.get("text"));
  if (!checklistId.success || !(await allowed())) {
    return denied();
  }
  if (pasted.length > 50_000) {
    return error("That's too long to paste at once. Split it in two.");
  }
  const sections = parseChecklistText(pasted);
  if (sections.length === 0) {
    return error("Nothing to add. Put one item on each line, and start sections with #.");
  }
  const result = await checklists.importSections(checklistId.data, sections);
  if (!result.ok) {
    return error(checklistErrorMessage(result.error));
  }
  return done(
    `Added ${sections.length} ${sections.length === 1 ? "section" : "sections"} and ${result.value} ${
      result.value === 1 ? "item" : "items"
    }.`,
  );
}

// ---------------------------------------------------------------------------
// Task lists (checklist app US-11). The database lets only church-wide checklist managers change
// them, and logs every change.
// ---------------------------------------------------------------------------

const listName = name(MAX_LIST_NAME_LENGTH, "Give the list a name.");
const listDescription = z
  .string()
  .transform((value) => value.replace(/\s+/g, " ").trim())
  .pipe(
    z
      .string()
      .max(MAX_LIST_DESCRIPTION_LENGTH, `Keep it under ${MAX_LIST_DESCRIPTION_LENGTH} characters.`),
  );

export async function createTaskListAction(_: FormState, formData: FormData): Promise<FormState> {
  const title = listName.safeParse(text(formData.get("name")));
  const description = listDescription.safeParse(text(formData.get("description")));
  const start = text(formData.get("copyFrom"));
  const copyFrom = start === "" ? null : id.safeParse(start);
  if (!title.success) {
    return error(title.error.issues[0]?.message ?? "Give the list a name.");
  }
  if (!description.success) {
    return error(description.error.issues[0]?.message ?? "Check the description.");
  }
  if ((copyFrom && !copyFrom.success) || !(await allowed())) {
    return denied();
  }
  const result = await checklists.createTaskList(
    title.data,
    description.data,
    copyFrom?.success ? copyFrom.data : null,
  );
  if (!result.ok) {
    return error(checklistErrorMessage(result.error));
  }
  redirect(`/admin/checklists?list=${result.value}`);
}

export async function updateTaskListAction(_: FormState, formData: FormData): Promise<FormState> {
  const listId = id.safeParse(formData.get("listId"));
  const title = listName.safeParse(text(formData.get("name")));
  const description = listDescription.safeParse(text(formData.get("description")));
  if (!listId.success || !(await allowed())) {
    return denied();
  }
  if (!title.success) {
    return error(title.error.issues[0]?.message ?? "Give the list a name.");
  }
  if (!description.success) {
    return error(description.error.issues[0]?.message ?? "Check the description.");
  }
  const result = await checklists.updateTaskList(listId.data, title.data, description.data);
  return result.ok ? done("Saved.") : error(checklistErrorMessage(result.error));
}

export async function setDefaultTaskListAction(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const listId = id.safeParse(formData.get("listId"));
  const switchCurrent = formData.get("switchCurrent") === "on";
  if (!listId.success || !(await allowed())) {
    return denied();
  }
  const result = await checklists.setDefaultTaskList(listId.data, switchCurrent);
  return result.ok
    ? done(
        switchCurrent
          ? "This is now the default, and the current service uses it."
          : "This is now the default. New services use it.",
      )
    : error(checklistErrorMessage(result.error));
}

export async function setTaskListHiddenAction(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const listId = id.safeParse(formData.get("listId"));
  const hidden = formData.get("hidden") === "true";
  if (!listId.success || !(await allowed())) {
    return denied();
  }
  const result = await checklists.setTaskListHidden(listId.data, hidden);
  return result.ok
    ? done(hidden ? "List hidden. Past services keep their records." : "List restored.")
    : error(checklistErrorMessage(result.error));
}
