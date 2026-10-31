"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/components/ui/action-form";
import { getAdminAccess } from "@/lib/data/admin/access";
import * as practicals from "@/lib/data/practicals";
import { feedbackSchema, OUTCOME_LABELS, practicalErrorMessage } from "@/lib/domain/practical";
import { suspendReasonSchema } from "@/lib/domain/competency";

// Recording what an observer saw (SRS-ASSESS-003, -004). There is no outcome field: the database
// works it out from the ticks and the pass rule, and grants the competency on a pass.

const id = z.uuid();
const text = (value: FormDataEntryValue | null) => (typeof value === "string" ? value : "");

function error(message: string): FormState {
  return { status: "error", message };
}

export async function recordAssessmentAction(_: FormState, formData: FormData): Promise<FormState> {
  const input = z
    .object({
      courseId: z.uuid(),
      practicalKey: z.uuid(),
      learnerId: z.uuid(),
      observedIds: z.array(z.uuid()).max(100),
      feedback: feedbackSchema,
    })
    .safeParse({
      courseId: formData.get("courseId"),
      practicalKey: formData.get("practicalKey"),
      learnerId: formData.get("learnerId"),
      observedIds: formData.getAll("observed"),
      feedback: text(formData.get("feedback")),
    });
  if (!input.success) {
    return error(input.error.issues[0]?.message ?? practicalErrorMessage("unknown"));
  }
  if (!(await getAdminAccess("assessments")).allowed) {
    return error(practicalErrorMessage("not_authorized"));
  }
  const result = await practicals.recordAssessment(input.data);
  if (!result.ok) {
    return error(practicalErrorMessage(result.error));
  }
  refresh();
  return {
    status: "done",
    message:
      result.id.outcome === "pass"
        ? "Recorded. The result is Pass: the competency is granted, and Approved to Serve is updated."
        : `Recorded. The result is ${OUTCOME_LABELS.further_practice}. They'll see your feedback.`,
  };
}

export async function voidAssessmentAction(_: FormState, formData: FormData): Promise<FormState> {
  const assessmentId = id.safeParse(formData.get("assessmentId"));
  const reason = suspendReasonSchema.safeParse(text(formData.get("reason")));
  if (!assessmentId.success) {
    return error(practicalErrorMessage("unknown"));
  }
  if (!reason.success) {
    return error(reason.error.issues[0]?.message ?? practicalErrorMessage("reason_required"));
  }
  if (!(await getAdminAccess("assessments")).allowed) {
    return error(practicalErrorMessage("not_authorized"));
  }
  const result = await practicals.voidAssessment(assessmentId.data, reason.data);
  if (!result.ok) {
    return error(
      result.error === "not_authorized"
        ? "Only leaders with competency approval for this department can withdraw an assessment."
        : practicalErrorMessage(result.error),
    );
  }
  refresh();
  return {
    status: "done",
    message: "Withdrawn. Any competency it granted is suspended, with your reason.",
  };
}
