"use server";

import type { FormState } from "@/components/ui/action-form";
import { requireActiveUser } from "@/lib/data/auth";
import { reportProblem } from "@/lib/data/problem-reports";
import { problemReportSchema, REPORT_ERRORS } from "@/lib/domain/problem-reports";

/** Report a problem, from the account menu (health check follow-up, G 2026-11-11). */
export async function reportProblemAction(_: FormState, formData: FormData): Promise<FormState> {
  await requireActiveUser();
  const parsed = problemReportSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "That didn't send. Try again.",
    };
  }
  const result = await reportProblem(parsed.data);
  if (!result.ok) {
    return {
      status: "error",
      message:
        REPORT_ERRORS[result.error] ?? "That didn't send. Check your connection and try again.",
    };
  }
  return { status: "done", message: "Thanks. Your note reached the team." };
}
