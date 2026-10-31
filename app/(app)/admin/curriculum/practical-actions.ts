"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { FormState } from "@/components/ui/action-form";
import { getAdminAccess } from "@/lib/data/admin/access";
import * as practicals from "@/lib/data/practicals";
import { curriculumErrorMessage, type CurriculumError } from "@/lib/domain/curriculum";
import {
  criterionSchema,
  newPracticalSchema,
  practicalSettingsSchema,
} from "@/lib/domain/practical";

// Practical checklists (SRS-ASSESS-001, -002) are edited in course drafts, like lessons and
// quizzes. Row-level security decides.

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

export async function addPracticalAction(_: FormState, formData: FormData): Promise<FormState> {
  const versionId = id.safeParse(formData.get("versionId"));
  const courseId = id.safeParse(formData.get("courseId"));
  const input = newPracticalSchema.safeParse({
    title: text(formData.get("title")),
    placement: formData.get("placement"),
  });
  if (!versionId.success || !courseId.success) {
    return failed("unknown");
  }
  if (!input.success) {
    return firstIssue(input);
  }
  if (!(await allowed())) {
    return failed("not_authorized");
  }
  const result = await practicals.addPractical(versionId.data, input.data);
  if (!result.ok) {
    return failed(result.error);
  }
  redirect(`/admin/curriculum/${courseId.data}/practicals/${result.id}`);
}

export async function updatePracticalAction(_: FormState, formData: FormData): Promise<FormState> {
  const practicalId = id.safeParse(formData.get("practicalId"));
  const settings = practicalSettingsSchema.safeParse({
    title: text(formData.get("title")),
    intro: text(formData.get("intro")),
    placement: formData.get("placement"),
    competencyId: formData.get("competencyId"),
    isRequired: formData.get("isRequired") === "on",
    requireAllRequired: formData.get("requireAllRequired") === "on",
    passMinPercent: formData.get("passMinPercent"),
    retryWaitDays: formData.get("retryWaitDays"),
  });
  if (!practicalId.success) {
    return failed("unknown");
  }
  if (!settings.success) {
    return firstIssue(settings);
  }
  if (!(await allowed())) {
    return failed("not_authorized");
  }
  const result = await practicals.updatePractical(practicalId.data, settings.data);
  if (!result.ok) {
    return failed(result.error);
  }
  refresh();
  return { status: "done", message: "Saved to the draft." };
}

export async function deletePracticalAction(_: FormState, formData: FormData): Promise<FormState> {
  const practicalId = id.safeParse(formData.get("practicalId"));
  const courseId = id.safeParse(formData.get("courseId"));
  if (!practicalId.success || !courseId.success || !(await allowed())) {
    return failed("not_authorized");
  }
  const result = await practicals.deletePractical(practicalId.data);
  if (!result.ok) {
    return failed(result.error);
  }
  redirect(`/admin/curriculum/${courseId.data}?tab=practicals`);
}

export async function addCriterionAction(_: FormState, formData: FormData): Promise<FormState> {
  const practicalId = id.safeParse(formData.get("practicalId"));
  const versionId = id.safeParse(formData.get("versionId"));
  const criterion = criterionSchema.safeParse({
    label: text(formData.get("label")),
    description: text(formData.get("description")),
    isRequired: formData.get("isRequired") === "on",
  });
  if (!practicalId.success || !versionId.success) {
    return failed("unknown");
  }
  if (!criterion.success) {
    return firstIssue(criterion);
  }
  if (!(await allowed())) {
    return failed("not_authorized");
  }
  const result = await practicals.addCriterion(practicalId.data, versionId.data, criterion.data);
  if (!result.ok) {
    return failed(result.error);
  }
  refresh();
  return { status: "done", message: "Added to the checklist." };
}

export async function deleteCriterionAction(_: FormState, formData: FormData): Promise<FormState> {
  const criterionId = id.safeParse(formData.get("criterionId"));
  if (!criterionId.success || !(await allowed())) {
    return failed("not_authorized");
  }
  const result = await practicals.deleteCriterion(criterionId.data);
  if (!result.ok) {
    return failed(result.error);
  }
  refresh();
  return { status: "done", message: "Removed from the checklist." };
}

export async function moveCriterionAction(_: FormState, formData: FormData): Promise<FormState> {
  const criterionId = id.safeParse(formData.get("criterionId"));
  const direction = z.enum(["up", "down"]).safeParse(formData.get("direction"));
  if (!criterionId.success || !direction.success || !(await allowed())) {
    return failed("not_authorized");
  }
  const result = await practicals.moveCriterion(criterionId.data, direction.data);
  if (!result.ok) {
    return failed(result.error);
  }
  refresh();
  return { status: "done", message: "Moved." };
}
