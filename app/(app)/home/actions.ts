"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/data/auth";
import { requestMembership } from "@/lib/data/departments";
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
