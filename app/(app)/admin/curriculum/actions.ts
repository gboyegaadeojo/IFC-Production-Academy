"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { FormState } from "@/components/ui/action-form";
import { getAdminAccess } from "@/lib/data/admin/access";
import * as curriculum from "@/lib/data/curriculum";
import {
  changeNoteSchema,
  courseDetailsSchema,
  courseTitleSchema,
  curriculumErrorMessage,
  lessonSchema,
  moduleSchema,
  type CurriculumError,
} from "@/lib/domain/curriculum";

// Every action: validate input with Zod, fail fast without the capability, then let the database
// decide (RLS for draft edits, functions for the lifecycle). SRS-CUR-001..008, SRS-RBAC-001.

const id = z.uuid();
const text = (value: FormDataEntryValue | null) => (typeof value === "string" ? value : "");

function error(message: string): FormState {
  return { status: "error", message };
}
function failed(code: CurriculumError): FormState {
  return error(curriculumErrorMessage(code));
}
function firstIssue(result: { error: z.ZodError }): FormState {
  return error(result.error.issues[0]?.message ?? curriculumErrorMessage("unknown"));
}

async function allowed(): Promise<boolean> {
  return (await getAdminAccess("curriculum")).allowed;
}

export async function createCourseAction(_: FormState, formData: FormData): Promise<FormState> {
  const levelId = id.safeParse(formData.get("levelId"));
  const title = courseTitleSchema.safeParse(text(formData.get("title")));
  if (!levelId.success) {
    return failed("unknown");
  }
  if (!title.success) {
    return firstIssue(title);
  }
  if (!(await allowed())) {
    return failed("not_authorized");
  }
  const result = await curriculum.createCourse(levelId.data, title.data);
  if (!result.ok) {
    return failed(result.error);
  }
  redirect(`/admin/curriculum/${result.id}`);
}

export async function startDraftAction(_: FormState, formData: FormData): Promise<FormState> {
  const courseId = id.safeParse(formData.get("courseId"));
  if (!courseId.success || !(await allowed())) {
    return failed("not_authorized");
  }
  const result = await curriculum.startCourseDraft(courseId.data);
  if (!result.ok) {
    return failed(result.error);
  }
  refresh();
  return {
    status: "done",
    message: "You're editing a new draft. The live version stays as it is until you publish.",
  };
}

export async function updateCourseDetailsAction(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const versionId = id.safeParse(formData.get("versionId"));
  const details = courseDetailsSchema.safeParse({
    title: text(formData.get("title")),
    summary: text(formData.get("summary")),
    objectives: text(formData.get("objectives")),
    estimatedMinutes: formData.get("estimatedMinutes"),
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
  const result = await curriculum.updateCourseDetails(versionId.data, details.data);
  if (!result.ok) {
    return failed(result.error);
  }
  refresh();
  return { status: "done", message: "Saved to the draft." };
}

export async function addModuleAction(_: FormState, formData: FormData): Promise<FormState> {
  const versionId = id.safeParse(formData.get("versionId"));
  const moduleInput = moduleSchema.safeParse({ title: text(formData.get("title")), summary: "" });
  if (!versionId.success) {
    return failed("unknown");
  }
  if (!moduleInput.success) {
    return firstIssue(moduleInput);
  }
  if (!(await allowed())) {
    return failed("not_authorized");
  }
  const sortOrder = await curriculum.nextModuleSortOrder(versionId.data);
  const result = await curriculum.addModule(versionId.data, { ...moduleInput.data, sortOrder });
  if (!result.ok) {
    return failed(result.error);
  }
  refresh();
  return { status: "done", message: "Module added." };
}

export async function updateModuleAction(_: FormState, formData: FormData): Promise<FormState> {
  const moduleId = id.safeParse(formData.get("moduleId"));
  const moduleInput = moduleSchema.safeParse({
    title: text(formData.get("title")),
    summary: text(formData.get("summary")),
  });
  if (!moduleId.success) {
    return failed("unknown");
  }
  if (!moduleInput.success) {
    return firstIssue(moduleInput);
  }
  if (!(await allowed())) {
    return failed("not_authorized");
  }
  const result = await curriculum.updateModule(moduleId.data, moduleInput.data);
  if (!result.ok) {
    return failed(result.error);
  }
  refresh();
  return { status: "done", message: "Saved." };
}

export async function deleteModuleAction(_: FormState, formData: FormData): Promise<FormState> {
  const moduleId = id.safeParse(formData.get("moduleId"));
  if (!moduleId.success || !(await allowed())) {
    return failed("not_authorized");
  }
  const result = await curriculum.deleteModule(moduleId.data);
  if (!result.ok) {
    return failed(result.error);
  }
  refresh();
  return { status: "done", message: "Module removed from the draft." };
}

const moveSchema = z.object({
  kind: z.enum(["module", "lesson"]),
  itemId: z.uuid(),
  direction: z.enum(["up", "down"]),
});

export async function moveAction(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = moveSchema.safeParse({
    kind: formData.get("kind"),
    itemId: formData.get("itemId"),
    direction: formData.get("direction"),
  });
  if (!parsed.success || !(await allowed())) {
    return failed("not_authorized");
  }
  const result = await curriculum.moveItem(
    parsed.data.kind === "module" ? "course_modules" : "lessons",
    parsed.data.itemId,
    parsed.data.direction,
  );
  if (!result.ok) {
    return failed(result.error);
  }
  refresh();
  return { status: "done", message: "Moved." };
}

export async function addLessonAction(_: FormState, formData: FormData): Promise<FormState> {
  const versionId = id.safeParse(formData.get("versionId"));
  const moduleId = id.safeParse(formData.get("moduleId"));
  const title = courseTitleSchema.safeParse(text(formData.get("title")));
  if (!versionId.success || !moduleId.success) {
    return failed("unknown");
  }
  if (!title.success) {
    return firstIssue(title);
  }
  if (!(await allowed())) {
    return failed("not_authorized");
  }
  const sortOrder = await curriculum.nextLessonSortOrder(moduleId.data);
  const result = await curriculum.addLesson(versionId.data, moduleId.data, title.data, sortOrder);
  if (!result.ok) {
    return failed(result.error);
  }
  refresh();
  return { status: "done", message: "Lesson added. Open it to write the content." };
}

export async function updateLessonAction(_: FormState, formData: FormData): Promise<FormState> {
  const lessonId = id.safeParse(formData.get("lessonId"));
  const lesson = lessonSchema.safeParse({
    moduleId: formData.get("moduleId"),
    title: text(formData.get("title")),
    summary: text(formData.get("summary")),
    objectives: text(formData.get("objectives")),
    estimatedMinutes: formData.get("estimatedMinutes"),
    isRequired: formData.get("isRequired") === "on",
    body: text(formData.get("body")),
    video: {
      provider: formData.get("videoProvider") ?? undefined,
      input: text(formData.get("video")),
    },
  });
  if (!lessonId.success) {
    return failed("unknown");
  }
  if (!lesson.success) {
    return firstIssue(lesson);
  }
  if (!(await allowed())) {
    return failed("not_authorized");
  }
  const result = await curriculum.updateLesson(lessonId.data, lesson.data);
  if (!result.ok) {
    return failed(result.error);
  }
  refresh();
  return { status: "done", message: "Saved to the draft." };
}

export async function deleteLessonAction(_: FormState, formData: FormData): Promise<FormState> {
  const lessonId = id.safeParse(formData.get("lessonId"));
  const courseId = id.safeParse(formData.get("courseId"));
  if (!lessonId.success || !courseId.success || !(await allowed())) {
    return failed("not_authorized");
  }
  const result = await curriculum.deleteLesson(lessonId.data);
  if (!result.ok) {
    return failed(result.error);
  }
  redirect(`/admin/curriculum/${courseId.data}`);
}

export async function publishAction(_: FormState, formData: FormData): Promise<FormState> {
  const versionId = id.safeParse(formData.get("versionId"));
  const rawNote = text(formData.get("changeNote"));
  if (!versionId.success) {
    return failed("unknown");
  }
  // A version in review already has its note; otherwise one is required.
  const note =
    rawNote.trim() === "" && formData.get("inReview") === "true"
      ? null
      : changeNoteSchema.safeParse(rawNote);
  if (note && !note.success) {
    return firstIssue(note);
  }
  if (!(await allowed())) {
    return failed("not_authorized");
  }
  const result = await curriculum.publishVersion(versionId.data, note ? note.data : null);
  if (!result.ok) {
    return failed(result.error);
  }
  refresh();
  return { status: "done", message: `Published as version ${result.id}. Members see it now.` };
}

export async function submitAction(_: FormState, formData: FormData): Promise<FormState> {
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
  const result = await curriculum.submitVersion(versionId.data, note.data);
  if (!result.ok) {
    return failed(result.error);
  }
  refresh();
  return {
    status: "done",
    message: "Sent for review. Someone else with publishing rights can publish it.",
  };
}

export async function returnAction(_: FormState, formData: FormData): Promise<FormState> {
  const versionId = id.safeParse(formData.get("versionId"));
  const reason = z
    .string()
    .trim()
    .max(300)
    .safeParse(text(formData.get("reason")));
  if (!versionId.success || !reason.success) {
    return failed("unknown");
  }
  if (!(await allowed())) {
    return failed("not_authorized");
  }
  const result = await curriculum.returnVersion(versionId.data, reason.data);
  if (!result.ok) {
    return failed(result.error);
  }
  refresh();
  return { status: "done", message: "Returned to draft." };
}

export async function restoreAction(_: FormState, formData: FormData): Promise<FormState> {
  const versionId = id.safeParse(formData.get("versionId"));
  if (!versionId.success || !(await allowed())) {
    return failed("not_authorized");
  }
  const result = await curriculum.restoreVersion(versionId.data);
  if (!result.ok) {
    return failed(result.error);
  }
  refresh();
  return {
    status: "done",
    message: "That version is now your draft. Publish it to make it live again.",
  };
}

export async function archiveAction(_: FormState, formData: FormData): Promise<FormState> {
  const courseId = id.safeParse(formData.get("courseId"));
  if (!courseId.success || !(await allowed())) {
    return failed("not_authorized");
  }
  const result = await curriculum.archiveCourse(courseId.data);
  if (!result.ok) {
    return failed(result.error);
  }
  refresh();
  return { status: "done", message: "Archived. Volunteers no longer see it; its history is kept." };
}
