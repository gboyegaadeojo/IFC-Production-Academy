import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/data/database.types";
import { publicEnv } from "@/lib/env";

/**
 * Service-role client, for Planning Center sign-in only (lib/data/planning-center-auth.ts): it
 * creates and signs in an account after Planning Center has vouched for the person. It bypasses
 * row-level security, so nothing else may use it. The key is a Cloudflare secret, never in the
 * repo, the browser, or a log. Null until it's set.
 */
export function createSupabaseAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    return null;
  }
  return createClient<Database>(publicEnv().NEXT_PUBLIC_SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
