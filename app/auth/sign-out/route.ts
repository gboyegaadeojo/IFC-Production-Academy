import { NextResponse, type NextRequest } from "next/server";
import { signOut } from "@/lib/data/auth";

/**
 * Signing out, as a plain form post (SRS-AUTH-005). A server action that redirects asks the app for
 * the next page with the old session still attached, so the sign-in page sent people back and the
 * page crashed. This ends the session, then the browser loads the sign-in page fresh, with nothing
 * of the session left in memory, which also suits a shared computer.
 */
export async function POST(request: NextRequest) {
  // Only from our own pages, so another site can't sign someone out.
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) {
    return new NextResponse(null, { status: 403 });
  }
  await signOut();
  return NextResponse.redirect(new URL("/sign-in", request.url), 303);
}
