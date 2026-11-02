import "server-only";
import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/data/supabase/server";
import {
  type DashboardError,
  type DashboardLayout,
  parseStoredLayout,
  toDashboardError,
} from "@/lib/domain/service-dashboard";

export type DashboardResult = { ok: true } | { ok: false; error: DashboardError };

function result(error: { code?: string; message?: string } | null): DashboardResult {
  return error ? { ok: false, error: toDashboardError(error) } : { ok: true };
}

/** Whether the signed-in person may open the Service Dashboard. Read once per request. */
export const canViewServiceDashboard = cache(async (): Promise<boolean> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("can_view_service_dashboard");
  return !error && data === true;
});

/** The church's one layout, or the default until an editor saves one. */
export async function getServiceDashboardLayout(): Promise<DashboardLayout> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("dashboard_layouts")
    .select("name, items, channels")
    .maybeSingle();
  if (error) {
    throw new Error("Could not load the Service Dashboard layout.");
  }
  return parseStoredLayout(data);
}

export async function saveServiceDashboardLayout(
  layout: DashboardLayout,
): Promise<DashboardResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("save_dashboard_layout", {
    p_name: layout.name,
    p_items: layout.items,
    p_channels: layout.channels,
  });
  return result(error);
}

export type DashboardPerson = { id: string; displayName: string; isEditor: boolean };

/** Active people, for choosing editors. Managers only, checked by the database. */
export async function getServiceDashboardPeople(): Promise<DashboardPerson[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("service_dashboard_people");
  if (error) {
    throw new Error("Could not load people for the Service Dashboard.");
  }
  return (data ?? []).map((person) => ({
    id: person.user_id,
    displayName: person.display_name,
    isEditor: person.is_editor,
  }));
}

export async function setServiceDashboardEditor(
  userId: string,
  isEditor: boolean,
): Promise<DashboardResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_dashboard_editor", {
    p_user_id: userId,
    p_is_editor: isEditor,
  });
  return result(error);
}
