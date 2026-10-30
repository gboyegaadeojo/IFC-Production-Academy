"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/data/auth";
import { acceptInvitation } from "@/lib/data/invitations";
import {
  acceptErrorMessage,
  isInvitationToken,
  PENDING_INVITE_COOKIE,
} from "@/lib/domain/invitations";

export type AcceptState = { status: "idle" } | { status: "error"; message: string };

/** SRS-MEM-002. The database checks the invitation and the person, and is safe to retry. */
export async function acceptInvitationAction(
  _previous: AcceptState,
  formData: FormData,
): Promise<AcceptState> {
  const token = formData.get("token");
  if (!isInvitationToken(token)) {
    return { status: "error", message: acceptErrorMessage("invitation_not_found") };
  }
  const user = await getCurrentUser();
  if (!user || user.status !== "active") {
    return { status: "error", message: acceptErrorMessage("not_authorized") };
  }
  const result = await acceptInvitation(token);
  if (!result.ok) {
    return { status: "error", message: acceptErrorMessage(result.error) };
  }
  (await cookies()).delete(PENDING_INVITE_COOKIE);
  redirect("/home");
}
