"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/data/auth";
import type { FormState } from "@/components/ui/action-form";
import { requestMembership } from "@/lib/data/departments";
import { chooseDepartment } from "@/lib/data/onboarding";
import { requestMembershipErrorMessage } from "@/lib/domain/departments";

export type RequestMembershipState = { status: "idle" } | { status: "error"; message: string };

const requestMembershipSchema = z.object({ departmentId: z.uuid() });

/** SRS-MEM-001. The database re-checks everything; this only fails fast with a clear message. */
export async function requestMembershipAction(
  _previous: RequestMembershipState,
  formData: FormData,
): Promise<RequestMembershipState> {
  const parsed = requestMembershipSchema.safeParse({ departmentId: formData.get("departmentId") });
  if (!parsed.success) {
    return { status: "error", message: requestMembershipErrorMessage("department_not_found") };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", message: requestMembershipErrorMessage("not_signed_in") };
  }

  const result = await requestMembership(parsed.data.departmentId);
  if (!result.ok) {
    return { status: "error", message: requestMembershipErrorMessage(result.error) };
  }

  refresh();
  return { status: "idle" };
}

/** The volunteer picks a department at their pathway's "Choose a department" step. */
export async function chooseDepartmentAction(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = z
    .object({ entryId: z.uuid(), departmentId: z.uuid() })
    .safeParse({ entryId: formData.get("entryId"), departmentId: formData.get("departmentId") });
  const user = await getCurrentUser();
  if (!parsed.success || !user || user.status !== "active") {
    return { status: "error", message: "Choose a department and try again." };
  }
  const chosen = await chooseDepartment(parsed.data.entryId, parsed.data.departmentId);
  if (!chosen.ok) {
    return { status: "error", message: "That didn't save. Refresh the page and try again." };
  }
  refresh();
  return { status: "done", message: "Thanks. Your department's training is next." };
}
