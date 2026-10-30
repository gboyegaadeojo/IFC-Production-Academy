"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { getAdminAccess } from "@/lib/data/admin/access";
import { decideMembership } from "@/lib/data/admin/members";
import { adminErrorMessage } from "@/lib/domain/admin";

export type DecisionState =
  { status: "idle" } | { status: "done"; message: string } | { status: "error"; message: string };

const decisionSchema = z.object({
  membershipId: z.uuid(),
  decision: z.enum(["active", "declined", "removed"]),
  reason: z
    .string()
    .trim()
    .max(500)
    .transform((value) => (value === "" ? null : value)),
});

const DONE: Record<"active" | "declined" | "removed", string> = {
  active: "Approved. They can start the department's training.",
  declined: "Request declined.",
  removed: "Removed from the department. Their training history is kept.",
};

/** SRS-MEM-003. The database checks member.approve for this department and records the decision. */
export async function decideMembershipAction(
  _previous: DecisionState,
  formData: FormData,
): Promise<DecisionState> {
  const parsed = decisionSchema.safeParse({
    membershipId: formData.get("membershipId"),
    decision: formData.get("decision"),
    reason: formData.get("reason") ?? "",
  });
  if (!parsed.success) {
    return { status: "error", message: adminErrorMessage("invalid_input") };
  }

  const { allowed } = await getAdminAccess("members");
  if (!allowed) {
    return { status: "error", message: adminErrorMessage("not_authorized") };
  }

  const result = await decideMembership(
    parsed.data.membershipId,
    parsed.data.decision,
    parsed.data.reason,
  );
  if (!result.ok) {
    return { status: "error", message: adminErrorMessage(result.error) };
  }
  refresh();
  return { status: "done", message: DONE[parsed.data.decision] };
}
