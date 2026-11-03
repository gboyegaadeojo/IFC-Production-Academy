import { NextResponse, type NextRequest } from "next/server";
import { SCREEN_PAIRING_COOKIE, startScreenPairing } from "@/lib/data/screens";

/** A TV asks for a code (ADD-DASH-06). The secret that collects its pass stays in a cookie. */
export async function POST(request: NextRequest): Promise<Response> {
  const pairing = await startScreenPairing();
  if (!pairing) {
    return NextResponse.json({ status: "unavailable" }, { status: 503 });
  }
  const response = NextResponse.json({ status: "ok", code: pairing.code });
  response.cookies.set(SCREEN_PAIRING_COOKIE, pairing.secret, {
    httpOnly: true,
    secure: request.nextUrl.protocol === "https:",
    sameSite: "lax",
    path: "/screen",
    maxAge: 15 * 60,
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
