"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { getAdminAccess } from "@/lib/data/admin/access";
import { createInvitation, revokeInvitation } from "@/lib/data/invitations";
import { adminErrorMessage } from "@/lib/domain/admin";
import { hasCapability } from "@/lib/domain/capabilities";
import {
  createInvitationErrorMessage,
  createInvitationSchema,
  invitationUrl,
  maxUsesFor,
} from "@/lib/domain/invitations";
import { publicEnv } from "@/lib/env";

export type CreateInvitationState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "created"; url: string; expiresAt: string; maxUses: number };

/** SRS-AUTH-003, SRS-MEM-002. The database checks member.invite for the department. */
export async function createInvitationAction(
  _previous: CreateInvitationState,
  formData: FormData,
): Promise<CreateInvitationState> {
  const parsed = createInvitationSchema.safeParse({
    departmentId: formData.get("departmentId") ?? "",
    audience: formData.get("audience"),
    groupSize: formData.get("groupSize"),
    validDays: formData.get("validDays"),
    note: formData.get("note") ?? "",
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? createInvitationErrorMessage("unknown"),
    };
  }
  const { grants, allowed } = await getAdminAccess("invitations");
  if (!allowed || !hasCapability(grants, "member.invite", parsed.data.departmentId)) {
    return { status: "error", message: createInvitationErrorMessage("not_authorized") };
  }

  const maxUses = maxUsesFor(parsed.data);
  const result = await createInvitation({
    departmentId: parsed.data.departmentId,
    maxUses,
    validDays: parsed.data.validDays,
    note: parsed.data.note,
  });
  if (!result.ok) {
    return { status: "error", message: createInvitationErrorMessage(result.error) };
  }
  refresh();
  return {
    status: "created",
    url: invitationUrl(publicEnv().NEXT_PUBLIC_SITE_URL, result.token),
    expiresAt: result.expiresAt,
    maxUses,
  };
}

export type RevokeState = { status: "idle" } | { status: "error"; message: string };

const revokeSchema = z.object({ invitationId: z.uuid() });

export async function revokeInvitationAction(
  _previous: RevokeState,
  formData: FormData,
): Promise<RevokeState> {
  const parsed = revokeSchema.safeParse({ invitationId: formData.get("invitationId") });
  if (!parsed.success) {
    return { status: "error", message: adminErrorMessage("invalid_input") };
  }
  const { allowed } = await getAdminAccess("invitations");
  if (!allowed) {
    return { status: "error", message: adminErrorMessage("not_authorized") };
  }
  if (!(await revokeInvitation(parsed.data.invitationId))) {
    return { status: "error", message: adminErrorMessage("not_authorized") };
  }
  refresh();
  return { status: "idle" };
}
