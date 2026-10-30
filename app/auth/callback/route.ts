import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { exchangeAuthCode } from "@/lib/data/auth";
import { afterSignInPath } from "../after-sign-in";

const codeSchema = z.string().min(1).max(512);

// Email links sent with Supabase's default template return here with a one-time code (PKCE).
// Our own template uses /auth/confirm instead.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const code = codeSchema.safeParse(params.get("code"));

  if (code.success) {
    const result = await exchangeAuthCode(code.data);
    if (result.ok) {
      return NextResponse.redirect(new URL(afterSignInPath(request), request.url));
    }
  }
  return NextResponse.redirect(new URL("/sign-in?error=link_invalid", request.url));
}
