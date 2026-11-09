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

export type MessagingSettings = { chatFileDays: number; messageTextYears: number };

/** How long chat files and message text are kept (ADD-MSG-05). The defaults if unreadable. */
export async function getMessagingSettings(): Promise<MessagingSettings> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("messaging_settings");
  const row = error ? undefined : data[0];
  return {
    chatFileDays: row?.chat_file_days ?? 90,
    messageTextYears: row?.message_text_years ?? 3,
  };
}

/** feature.manage only; organizations' audit trigger records the change. */
export async function setMessagingRetention(settings: MessagingSettings): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_messaging_retention", {
    p_file_days: settings.chatFileDays,
    p_text_years: settings.messageTextYears,
  });
  return !error;
}

/** The database checks feature.manage and writes the audit event. */
export async function setFeatureFlag(key: FeatureKey, enabled: boolean): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_feature_flag", { p_key: key, p_enabled: enabled });
  return !error;
}
