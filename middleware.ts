import type { NextRequest } from "next/server";
import { refreshSession } from "@/lib/data/supabase/middleware";

// Edge middleware, not proxy.ts: Next 16's proxy always runs on Node.js, which OpenNext on
// Cloudflare supports only experimentally. This only refreshes the auth cookie (see refreshSession).
export async function middleware(request: NextRequest) {
  return refreshSession(request);
}

export const config = {
  matcher: [
    // Everything except static files and images, the service worker and its offline page, and
    // the version check, which needs no session.
    "/((?!_next/static|_next/image|favicon.ico|sw\\.js|offline\\.html|api/version|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|webmanifest)$).*)",
  ],
};
