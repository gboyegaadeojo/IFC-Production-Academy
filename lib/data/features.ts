import "server-only";
import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/data/supabase/server";
import { featureFlagsFrom, type FeatureFlags, type FeatureKey } from "@/lib/domain/features";

/**
 * Which modules are on for the signed-in person's organization, read once per request (ADD-FLAG-01).
 * Off if they can't be read, so a module never appears by mistake.
 */
export const getFeatureFlags = cache(async (): Promise<FeatureFlags> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("feature_flags").select("key, enabled");
  return featureFlagsFrom(error ? [] : data);
});

/** The database checks feature.manage and writes the audit event. */
export async function setFeatureFlag(key: FeatureKey, enabled: boolean): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_feature_flag", { p_key: key, p_enabled: enabled });
  return !error;
}
