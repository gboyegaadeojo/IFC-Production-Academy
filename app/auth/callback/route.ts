import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { exchangeOAuthCode } from "@/lib/data/auth";
import { safeNextPath } from "@/lib/domain/auth";

const codeSchema = z.string().min(1).max(512);

// Google sign-in, and email links sent with Supabase's default template (via=email), return
// here with a one-time code (PKCE).
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const code = codeSchema.safeParse(params.get("code"));

  if (code.success) {
    const result = await exchangeOAuthCode(code.data);
    if (result.ok) {
      return NextResponse.redirect(new URL(safeNextPath(params.get("next")), request.url));
    }
  }
  const error = params.get("via") === "email" ? "link_invalid" : "oauth_failed";
  return NextResponse.redirect(new URL(`/sign-in?error=${error}`, request.url));
}
