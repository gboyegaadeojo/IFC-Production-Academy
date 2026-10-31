"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { FormState } from "@/components/ui/action-form";
import { getAdminAccess } from "@/lib/data/admin/access";
import * as sops from "@/lib/data/sops";
import { changeNoteSchema } from "@/lib/domain/curriculum";
import {
  checkSopFile,
  SOP_FILE_PROBLEMS,
  sopDetailsSchema,
  sopErrorMessage,
  sopSettingsSchema,
  sopTitleSchema,
  type SopError,
} from "@/lib/domain/sops";

// SOP library changes (SRS-SOP-001..006). Validate with Zod, fail fast without access, then let the
// database and the storage policies decide.

const id = z.uuid();
const text = (value: FormDataEntryValue | null) => (typeof value === "string" ? value : "");

function error(message: string): FormState {
  return { status: "error", message };
}
function failed(code: SopError): FormState {
  return error(sopErrorMessage(code));
}
function firstIssue(result: { error: z.ZodError }): FormState {
  return error(result.error.issues[0]?.message ?? sopErrorMessage("unknown"));
}

async function allowed(): Promise<boolean> {
  return (await getAdminAccess("sops")).allowed;
}

export async function createSopAction(_: FormState, formData: FormData): Promise<FormState> {
  const departmentId = id.safeParse(formData.get("departmentId"));
  const title = sopTitleSchema.safeParse(text(formData.get("title")));
  if (!departmentId.success) {
    return error("Choose a department.");
  }
  if (!title.success) {
    return firstIssue(title);
  }
  if (!(await allowed())) {
    return failed("not_authorized");
  }
  const result = await sops.createSop(departmentId.data, title.data);
  if (!result.ok) {
    return failed(result.error);
  }
  redirect(`/admin/sops/${result.id}`);
}

export async function startSopDraftAction(_: FormState, formData: FormData): Promise<FormState> {
  const sopId = id.safeParse(formData.get("sopId"));
  if (!sopId.success || !(await allowed())) {
    return failed("not_authorized");
  }
  const result = await sops.startSopDraft(sopId.data);
  if (!result.ok) {
    return failed(result.error);
  }
  refresh();
  return {
    status: "done",
    message:
      "You're editing a new draft. Members keep seeing the current version until you publish.",
  };
}

export async function updateSopDraftAction(_: FormState, formData: FormData): Promise<FormState> {
  const versionId = id.safeParse(formData.get("versionId"));
  const details = sopDetailsSchema.safeParse({
    title: text(formData.get("title")),
    summary: text(formData.get("summary")),
  });
  if (!versionId.success) {
    return failed("unknown");
  }
  if (!details.success) {
    return firstIssue(details);
  }
  if (!(await allowed())) {
    return failed("not_authorized");
  }
  const result = await sops.updateSopDraft(versionId.data, details.data);
  if (!result.ok) {
    return failed(result.error);
  }
  refresh();
  return { status: "done", message: "Saved to the draft." };
}

export async function uploadSopFileAction(_: FormState, formData: FormData): Promise<FormState> {
  const versionId = id.safeParse(formData.get("versionId"));
  const file = formData.get("file");
  if (!versionId.success) {
    return failed("unknown");
  }
  if (!(file instanceof File)) {
    return error(SOP_FILE_PROBLEMS.missing);
  }
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const checked = checkSopFile({ size: file.size, name: file.name }, head);
  if (!checked.ok) {
    return error(SOP_FILE_PROBLEMS[checked.problem]);
  }
  if (!(await allowed())) {
    return failed("not_authorized");
  }
  const result = await sops.uploadSopFile(versionId.data, {
    bytes: new Uint8Array(await file.arrayBuffer()),
    name: checked.name,
    type: checked.type,
  });
  if (!result.ok) {
    return failed(result.error);
  }
  refresh();
  return { status: "done", message: "File uploaded to the draft." };
}

export async function updateSopSettingsAction(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const sopId = id.safeParse(formData.get("sopId"));
  const settings = sopSettingsSchema.safeParse({
    category: text(formData.get("category")),
    reviewIntervalMonths: formData.get("reviewIntervalMonths"),
  });
  if (!sopId.success) {
    return failed("unknown");
  }
  if (!settings.success) {
    return firstIssue(settings);
  }
  if (!(await allowed())) {
    return failed("not_authorized");
  }
  const result = await sops.updateSopSettings(sopId.data, settings.data);
  if (!result.ok) {
    return failed(result.error);
  }
  refresh();
  return { status: "done", message: "Saved." };
}

export async function publishSopAction(_: FormState, formData: FormData): Promise<FormState> {
  const versionId = id.safeParse(formData.get("versionId"));
  const note = changeNoteSchema.safeParse(text(formData.get("changeNote")));
  if (!versionId.success) {
    return failed("unknown");
  }
  if (!note.success) {
    return firstIssue(note);
  }
  if (!(await allowed())) {
    return failed("not_authorized");
  }
  const result = await sops.publishSopVersion(versionId.data, note.data);
  if (!result.ok) {
    return failed(result.error);
  }
  refresh();
  return {
    status: "done",
    message: `Published as version ${result.id}. It's now the current version.`,
  };
}

export async function markSopReviewedAction(_: FormState, formData: FormData): Promise<FormState> {
  const sopId = id.safeParse(formData.get("sopId"));
  if (!sopId.success || !(await allowed())) {
    return failed("not_authorized");
  }
  const result = await sops.markSopReviewed(sopId.data);
  if (!result.ok) {
    return failed(result.error);
  }
  refresh();
  return { status: "done", message: "Marked as reviewed today." };
}

export async function archiveSopAction(_: FormState, formData: FormData): Promise<FormState> {
  const sopId = id.safeParse(formData.get("sopId"));
  if (!sopId.success || !(await allowed())) {
    return failed("not_authorized");
  }
  const result = await sops.archiveSop(sopId.data);
  if (!result.ok) {
    return failed(result.error);
  }
  refresh();
  return { status: "done", message: "Archived. Members no longer see it; its history is kept." };
}

// Lesson resources (SRS-LESSON-005): drafts only, the department's own SOPs.

export async function addLessonResourceAction(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const lessonId = id.safeParse(formData.get("lessonId"));
  const sopId = id.safeParse(formData.get("sopId"));
  if (!lessonId.success) {
    return failed("unknown");
  }
  if (!sopId.success) {
    return error("Choose an SOP to attach.");
  }
  if (!(await getAdminAccess("curriculum")).allowed) {
    return failed("not_authorized");
  }
  const result = await sops.addLessonResource(lessonId.data, sopId.data);
  if (!result.ok) {
    return failed(result.error);
  }
  refresh();
  return { status: "done", message: "Attached to the draft lesson." };
}

export async function removeLessonResourceAction(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const resourceId = id.safeParse(formData.get("resourceId"));
  if (!resourceId.success || !(await getAdminAccess("curriculum")).allowed) {
    return failed("not_authorized");
  }
  const result = await sops.removeLessonResource(resourceId.data);
  if (!result.ok) {
    return failed(result.error);
  }
  refresh();
  return { status: "done", message: "Removed from the draft lesson." };
}
