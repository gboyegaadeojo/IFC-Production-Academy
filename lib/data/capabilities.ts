import "server-only";
import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/data/supabase/server";
import type { CapabilityGrant } from "@/lib/domain/capabilities";

/**
 * The signed-in person's capability grants, read once per request. Server actions use these with
 * hasCapability() to fail fast (SRS-RBAC-001); row-level security still makes the final decision.
 */
export const getMyCapabilities = cache(async (): Promise<CapabilityGrant[]> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("my_capabilities");
  if (error) {
    throw new Error("Could not load permissions", { cause: error.code });
  }
  return data.map((row) => ({ capability: row.capability, departmentId: row.department_id }));
});
