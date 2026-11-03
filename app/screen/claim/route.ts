import { NextResponse, type NextRequest } from "next/server";
import { claimScreen, SCREEN_PAIRING_COOKIE, SCREEN_TOKEN_COOKIE } from "@/lib/data/screens";

/** A TV asks whether its code was approved. If so, it keeps its pass in a long-lived cookie. */
export async function POST(request: NextRequest): Promise<Response> {
  const secret = request.cookies.get(SCREEN_PAIRING_COOKIE)?.value;
  if (!secret) {
    return NextResponse.json({ status: "expired" });
  }
  const claim = await claimScreen(secret);
  const response = NextResponse.json({ status: claim.status });
  response.headers.set("Cache-Control", "no-store");
  if (claim.status === "approved" && claim.token) {
    response.cookies.set(SCREEN_TOKEN_COOKIE, claim.token, {
      httpOnly: true,
      secure: request.nextUrl.protocol === "https:",
      sameSite: "lax",
      path: "/screen",
      // Browsers cap this at 400 days. Each visit below renews it.
      maxAge: 400 * 24 * 60 * 60,
    });
    response.cookies.delete({ name: SCREEN_PAIRING_COOKIE, path: "/screen" });
  }
  return response;
}
