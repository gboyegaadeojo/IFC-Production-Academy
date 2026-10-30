import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { publicEnv } from "@/lib/env";
import type { Database } from "@/lib/data/database.types";

/**
 * Refreshes the Supabase session cookie on each request so Server Components see a valid token.
 * It does not decide who may see what: pages check the user through lib/data, and the database
 * enforces row-level security.
 */
export async function refreshSession(request: NextRequest): Promise<NextResponse> {
  const env = publicEnv();
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
          // Cache headers from Supabase stop a CDN from caching a response that sets auth cookies.
          for (const [key, value] of Object.entries(headers)) {
            response.headers.set(key, value);
          }
        },
      },
    },
  );

  // Validates the token and refreshes it if needed. Nothing may run between client creation
  // and this call, or sessions can end unexpectedly.
  await supabase.auth.getClaims();

  return response;
}
