import { NextResponse, type NextRequest } from "next/server";
import { verifyEmailLink } from "@/lib/data/auth";
import { authConfirmParamsSchema } from "@/lib/domain/auth";
import { afterSignInPath } from "../after-sign-in";

// Magic links land here with a one-time token hash (supabase/templates/magic-link.html).
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const parsed = authConfirmParamsSchema.safeParse({
    token_hash: params.get("token_hash"),
    type: params.get("type"),
  });

  if (parsed.success) {
    const result = await verifyEmailLink(parsed.data.token_hash, parsed.data.type);
    if (result.ok) {
      return NextResponse.redirect(new URL(afterSignInPath(request), request.url));
    }
  }
  return NextResponse.redirect(new URL("/sign-in?error=link_invalid", request.url));
}
