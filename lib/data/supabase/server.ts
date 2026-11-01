import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { publicEnv } from "@/lib/env";
import type { Database } from "@/lib/data/database.types";

/**
 * Supabase client for Server Components, Server Actions, and Route Handlers. It acts as the
 * signed-in person, so row-level security applies to every query. The service-role key is used
 * only by Planning Center sign-in (./admin.ts).
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const env = publicEnv();

  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Components can't set cookies. middleware.ts refreshes the session before
            // rendering, so there is nothing to persist here.
          }
        },
      },
    },
  );
}
