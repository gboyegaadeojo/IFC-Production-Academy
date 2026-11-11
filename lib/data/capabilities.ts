import "server-only";
import { cache } from "react";
import { getCurrentUser } from "@/lib/data/auth";
import { createSupabaseServerClient } from "@/lib/data/supabase/server";
import type { CapabilityGrant } from "@/lib/domain/capabilities";

/**
 * The signed-in person's capability grants, read once per request. Server actions use these with
 * hasCapability() to fail fast (SRS-RBAC-001); row-level security still makes the final decision.
 */
export const getMyCapabilities = cache(async (): Promise<CapabilityGrant[]> => {
  // Signed out: none, without asking the database (a page can ask before its sign-in check
  // redirects, which logged "permission denied"; health check, 2026-11-10).
  if (!(await getCurrentUser())) {
    return [];
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("my_capabilities");
  if (error) {
    throw new Error("Could not load permissions", { cause: error.code });
  }
  return data.map((row) => ({ capability: row.capability, departmentId: row.department_id }));
});
