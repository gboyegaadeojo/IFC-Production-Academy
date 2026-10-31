"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/components/ui/action-form";
import { getCurrentUser } from "@/lib/data/auth";
import * as practicals from "@/lib/data/practicals";
import { practicalErrorMessage } from "@/lib/domain/practical";

// The learner asks to be assessed, or withdraws the request (ADD-ASSESS-01). Idempotent.

async function signedIn(): Promise<boolean> {
  return (await getCurrentUser())?.status === "active";
}

export async function requestAssessmentAction(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const input = z
    .object({ courseId: z.uuid(), practicalKey: z.uuid() })
    .safeParse({ courseId: formData.get("courseId"), practicalKey: formData.get("practicalKey") });
  if (!input.success || !(await signedIn())) {
    return { status: "error", message: practicalErrorMessage("unknown") };
  }
  const result = await practicals.requestAssessment(input.data.courseId, input.data.practicalKey);
  if (!result.ok) {
    return {
      status: "error",
      message:
        result.error === "not_authorized"
          ? "Practical assessments are for members of the department."
          : practicalErrorMessage(result.error),
    };
  }
  refresh();
  return { status: "done", message: "Request sent. A trainer will arrange a time with you." };
}

export async function cancelRequestAction(_: FormState, formData: FormData): Promise<FormState> {
  const requestId = z.uuid().safeParse(formData.get("requestId"));
  if (!requestId.success || !(await signedIn())) {
    return { status: "error", message: practicalErrorMessage("unknown") };
  }
  const result = await practicals.cancelAssessmentRequest(requestId.data);
  if (!result.ok) {
    return { status: "error", message: practicalErrorMessage(result.error) };
  }
  refresh();
  return { status: "done", message: "Request withdrawn." };
}
