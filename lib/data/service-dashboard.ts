import "server-only";
import { cache } from "react";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/data/supabase/server";
import {
  type DashboardError,
  type DashboardLayout,
  parseStoredLayout,
  type PlanItem,
  type TeamRow,
  toDashboardError,
  trainedLabel,
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

export type DashboardService = { id: string; title: string; startsAt: string; endsAt: string };

/** The services to choose from: from a day ago to a month ahead, soonest first. */
export async function getDashboardServices(): Promise<DashboardService[]> {
  const supabase = await createSupabaseServerClient();
  const now = Date.now();
  const { data, error } = await supabase
    .from("events")
    .select("id, title, starts_at, ends_at")
    .is("cancelled_at", null)
    .gte("ends_at", new Date(now - 86_400_000).toISOString())
    .lt("starts_at", new Date(now + 31 * 86_400_000).toISOString())
    .order("starts_at")
    .limit(30);
  if (error) {
    throw new Error("Could not load services for the Service Dashboard.");
  }
  return data.map((event) => ({
    id: event.id,
    title: event.title,
    startsAt: event.starts_at,
    endsAt: event.ends_at,
  }));
}

const planNotes = z.array(z.object({ category: z.string(), content: z.string() }));

export async function getPlanItems(eventId: string): Promise<PlanItem[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("service_plan_items")
    .select("id, position, item_type, title, length_seconds, service_position, notes")
    .eq("event_id", eventId)
    .order("position");
  if (error) {
    throw new Error("Could not load the run of service.");
  }
  return data.map((row) => ({
    id: row.id,
    position: row.position,
    itemType: row.item_type,
    title: row.title,
    lengthSeconds: row.length_seconds,
    servicePosition:
      row.service_position === "pre" || row.service_position === "post"
        ? row.service_position
        : "during",
    notes: planNotes.safeParse(row.notes).data ?? [],
  }));
}

export async function getDashboardTeam(eventId: string): Promise<TeamRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("service_dashboard_team", { p_event_id: eventId });
  if (error) {
    throw new Error("Could not load who's serving.");
  }
  return data.map((row) => ({
    positionId: row.position_id,
    roleName: row.role_name,
    name: row.display_name,
    label: trainedLabel(row.readiness),
  }));
}

export async function getServiceNote(eventId: string): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("service_notes")
    .select("body")
    .eq("event_id", eventId)
    .maybeSingle();
  if (error) {
    throw new Error("Could not load the producer notes.");
  }
  return data?.body ?? "";
}

export async function saveServiceNote(eventId: string, body: string): Promise<DashboardResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("save_service_note", {
    p_event_id: eventId,
    p_body: body,
  });
  return result(error);
}

/** The YouTube channel, for the stream preview. Null until it's set. */
export async function getStreamChannel(eventId: string): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("service_stream_state", {
    p_event_id: eventId,
    p_platform: "youtube",
  });
  if (error) {
    return null;
  }
  return z.object({ channel: z.string().nullable() }).safeParse(data).data?.channel ?? null;
}
