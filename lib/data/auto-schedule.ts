import "server-only";
import { createSupabaseServerClient } from "@/lib/data/supabase/server";
import {
  HOUSEHOLD_MODES,
  type HouseholdMode,
  type Proposal,
  type SchedulingPreferences,
} from "@/lib/domain/auto-schedule";
import { toScheduleError, type ScheduleError } from "@/lib/domain/schedule";

// Auto-schedule and preferences (plan "Academy scheduling", PR 8). The database checks who may
// do what; these read and pass values on.

type Result<T> = { ok: true; value: T } | { ok: false; error: ScheduleError };

/** Suggestions for the open places in these services. Only reads; nobody is added. */
export async function proposeSchedule(eventIds: string[]): Promise<Proposal[]> {
  if (eventIds.length === 0) {
    return [];
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("propose_schedule", { p_event_ids: eventIds });
  if (error) {
    throw new Error("Could not suggest a schedule", { cause: error.code });
  }
  return data.map((row) => ({
    positionId: row.position_id,
    userId: row.user_id,
    name: row.display_name,
    reason: row.reason,
  }));
}

/** Adds the kept suggestions as "Not sent yet". Returns how many were added. */
export async function applyProposal(
  items: { position_id: string; user_id: string }[],
): Promise<Result<number>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("apply_schedule_proposal", { p_items: items });
  return error ? { ok: false, error: toScheduleError(error) } : { ok: true, value: data };
}

export async function getMyPreferences(userId: string): Promise<SchedulingPreferences> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("scheduling_preferences")
    .select("max_per_month, household_member_id, household_mode")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    throw new Error("Could not load your preferences", { cause: error.code });
  }
  return {
    maxPerMonth: data?.max_per_month ?? null,
    householdMemberId: data?.household_member_id ?? null,
    householdMode: (HOUSEHOLD_MODES as readonly string[]).includes(data?.household_mode ?? "")
      ? (data?.household_mode as HouseholdMode)
      : null,
  };
}

/** People someone can choose to serve with: members of their departments. */
export async function getHouseholdOptions(): Promise<{ id: string; name: string }[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("household_options");
  if (error) {
    throw new Error("Could not load people", { cause: error.code });
  }
  return data.map((row) => ({ id: row.user_id, name: row.display_name }));
}

export async function setMyPreferences(
  preferences: SchedulingPreferences,
): Promise<{ ok: boolean }> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_my_scheduling_preferences", {
    p_max_per_month: preferences.maxPerMonth,
    p_household_member_id: preferences.householdMemberId,
    p_household_mode: preferences.householdMode,
  });
  return { ok: !error };
}
