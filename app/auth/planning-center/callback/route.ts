import { NextResponse, type NextRequest } from "next/server";
import {
  exchangePcoCode,
  pcoAuthConfig,
  readPcoIdentity,
  signInAsPcoPerson,
} from "@/lib/data/planning-center-auth";
import { safeNextPath, type SignInError } from "@/lib/domain/auth";
import { isInvitationToken, PENDING_INVITE_COOKIE } from "@/lib/domain/invitations";
import {
  PCO_CALLBACK_PATH,
  PCO_STATE_COOKIE,
  pcoCallbackSchema,
  sameState,
  unpackState,
} from "@/lib/domain/planning-center-auth";
import { publicEnv } from "@/lib/env";

// Planning Center sends people back here (checklist app US-01). The state must match this
// browser's; the code is swapped for a token on the server, and the database decides whether
// they're one of IFC's people. Errors go back to sign-in as codes, never provider messages.
export async function GET(request: NextRequest) {
  const fail = (error: SignInError) => {
    const response = NextResponse.redirect(new URL(`/sign-in?error=${error}`, request.url));
    response.cookies.delete({ name: PCO_STATE_COOKIE, path: "/auth/planning-center" });
    return response;
  };

  const params = request.nextUrl.searchParams;
  if (params.get("error") === "access_denied") {
    return fail("pco_cancelled");
  }
  const config = pcoAuthConfig();
  const saved = unpackState(request.cookies.get(PCO_STATE_COOKIE)?.value);
  const callback = pcoCallbackSchema.safeParse({
    code: params.get("code"),
    state: params.get("state"),
  });
  if (!config || !saved || !callback.success || !sameState(saved.state, callback.data.state)) {
    return fail("pco_failed");
  }

  const redirectUri = new URL(PCO_CALLBACK_PATH, publicEnv().NEXT_PUBLIC_SITE_URL).toString();
  const token = await exchangePcoCode(config, callback.data.code, redirectUri);
  const who = token ? await readPcoIdentity(token) : null;
  if (!who) {
    return fail("pco_failed");
  }
  const result = await signInAsPcoPerson(who.identity, who.organizationId);
  if (!result.ok) {
    return fail(result.error);
  }

  const invite = request.cookies.get(PENDING_INVITE_COOKIE)?.value;
  const destination = isInvitationToken(invite) ? `/invite/${invite}` : safeNextPath(saved.next);
  const response = NextResponse.redirect(new URL(destination, request.url));
  response.cookies.delete({ name: PCO_STATE_COOKIE, path: "/auth/planning-center" });
  return response;
}
