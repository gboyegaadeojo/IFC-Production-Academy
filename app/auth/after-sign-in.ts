import type { NextRequest } from "next/server";
import { safeNextPath } from "@/lib/domain/auth";
import { isInvitationToken, PENDING_INVITE_COOKIE } from "@/lib/domain/invitations";

/** Where an email link lands: back on a pending invitation if there is one, otherwise `next`. */
export function afterSignInPath(request: NextRequest): string {
  const invite = request.cookies.get(PENDING_INVITE_COOKIE)?.value;
  if (isInvitationToken(invite)) {
    return `/invite/${invite}`;
  }
  return safeNextPath(request.nextUrl.searchParams.get("next"));
}
