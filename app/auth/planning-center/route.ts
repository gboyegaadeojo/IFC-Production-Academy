import { NextResponse, type NextRequest } from "next/server";
import { pcoAuthConfig } from "@/lib/data/planning-center-auth";
import { safeNextPath } from "@/lib/domain/auth";
import {
  PCO_CALLBACK_PATH,
  PCO_STATE_COOKIE,
  PCO_STATE_MAX_AGE,
  packState,
  pcoAuthorizeUrl,
} from "@/lib/domain/planning-center-auth";
import { publicEnv } from "@/lib/env";

// Sign in with Planning Center (checklist app US-01): off to Planning Center, with a one-time
// state remembered on this browser so only its own callback is accepted.
export function GET(request: NextRequest) {
  const config = pcoAuthConfig();
  if (!config) {
    return NextResponse.redirect(new URL("/sign-in?error=pco_failed", request.url));
  }
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const state = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  const next = safeNextPath(request.nextUrl.searchParams.get("next"));
  const redirectUri = new URL(PCO_CALLBACK_PATH, publicEnv().NEXT_PUBLIC_SITE_URL).toString();

  const response = NextResponse.redirect(pcoAuthorizeUrl(config.clientId, redirectUri, state));
  response.cookies.set(PCO_STATE_COOKIE, packState(state, next), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/auth/planning-center",
    maxAge: PCO_STATE_MAX_AGE,
  });
  return response;
}
