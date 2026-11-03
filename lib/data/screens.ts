import "server-only";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/lib/data/database.types";
import { createSupabaseServerClient } from "@/lib/data/supabase/server";
import { publicEnv } from "@/lib/env";
import {
  type DashboardLayout,
  type DashboardError,
  parseStoredLayout,
  type PlanItem,
  type TeamRow,
  toDashboardError,
  trainedLabel,
} from "@/lib/domain/service-dashboard";

/**
 * The wall TV (ADD-DASH-06). It has no account, so it talks to the database as a visitor and shows
 * its pass to narrow functions that return only what the dashboard shows. No service-role key.
 */
export function createScreenClient() {
  const env = publicEnv();
  return createClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
  );
}

export const SCREEN_TOKEN_COOKIE = "screen_token";
export const SCREEN_PAIRING_COOKIE = "screen_pairing";

export async function startScreenPairing(): Promise<{
  code: string;
  secret: string;
  expiresAt: string;
} | null> {
  const { data, error } = await createScreenClient().rpc("screen_start_pairing");
  const row = error ? null : data?.[0];
  return row ? { code: row.code, secret: row.secret, expiresAt: row.expires_at } : null;
}

const claimSchema = z.object({
  status: z.enum(["waiting", "approved", "expired"]),
  token: z.string().optional(),
});

export async function claimScreen(secret: string): Promise<z.infer<typeof claimSchema>> {
  const { data, error } = await createScreenClient().rpc("screen_claim", { p_secret: secret });
  return (error ? null : claimSchema.safeParse(data).data) ?? { status: "waiting" };
}

const dashboardSchema = z.object({
  layout: z.object({ name: z.string(), items: z.unknown(), channels: z.unknown() }).nullable(),
  channel: z.string().nullable(),
  service: z
    .object({
      id: z.string(),
      title: z.string(),
      startsAt: z.string(),
      endsAt: z.string(),
    })
    .nullable(),
  items: z.array(
    z.object({
      id: z.string(),
      position: z.number(),
      itemType: z.string(),
      title: z.string(),
      lengthSeconds: z.number(),
      servicePosition: z.string(),
      notes: z.array(z.object({ category: z.string(), content: z.string() })).catch([]),
    }),
  ),
  team: z.array(
    z.object({
      positionId: z.string(),
      roleName: z.string(),
      name: z.string().nullable(),
      readiness: z.string().nullable(),
    }),
  ),
  note: z.string(),
  checklists: z.array(z.object({ name: z.string(), done: z.number(), total: z.number() })),
});

export type ScreenDashboard = {
  layout: DashboardLayout;
  channel: string | null;
  service: { id: string; title: string; startsAt: string; endsAt: string } | null;
  items: PlanItem[];
  team: TeamRow[];
  note: string;
  checklists: { name: string; done: number; total: number }[];
};

/** Everything the TV shows, or null if its pass isn't valid. */
export async function getScreenDashboard(token: string): Promise<ScreenDashboard | null> {
  const { data, error } = await createScreenClient().rpc("screen_dashboard", { p_token: token });
  if (error) {
    throw new Error("Could not load the screen.");
  }
  if (data === null) {
    return null;
  }
  const parsed = dashboardSchema.parse(data);
  return {
    layout: parseStoredLayout(parsed.layout),
    channel: parsed.channel,
    service: parsed.service,
    items: parsed.items.map((item) => ({
      ...item,
      servicePosition:
        item.servicePosition === "pre" || item.servicePosition === "post"
          ? item.servicePosition
          : "during",
    })),
    team: parsed.team.map((row) => ({
      positionId: row.positionId,
      roleName: row.roleName,
      name: row.name,
      label: trainedLabel(row.readiness),
    })),
    note: parsed.note,
    checklists: parsed.checklists,
  };
}

export type ScreenSummary = {
  id: string;
  name: string;
  lastSeenAt: string | null;
  addedByName: string | null;
};

type Result = { ok: true } | { ok: false; error: DashboardError | "screen_code_not_found" };

function result(error: { code?: string; message?: string } | null): Result {
  if (!error) {
    return { ok: true };
  }
  return error.message === "screen_code_not_found"
    ? { ok: false, error: "screen_code_not_found" }
    : { ok: false, error: toDashboardError(error) };
}

export async function getScreens(): Promise<ScreenSummary[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("service_dashboard_screens");
  if (error) {
    throw new Error("Could not load screens.");
  }
  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    lastSeenAt: row.last_seen_at,
    addedByName: row.added_by_name,
  }));
}

export async function approveScreen(code: string, name: string): Promise<Result> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("approve_screen", { p_code: code, p_name: name });
  return result(error);
}

export async function removeScreen(id: string): Promise<Result> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("remove_screen", { p_screen_id: id });
  return result(error);
}

export async function getYoutubeChannel(): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("service_dashboard_connections");
  if (error) {
    throw new Error("Could not load connections.");
  }
  return data?.[0]?.youtube_channel_id ?? "";
}

export async function setYoutubeChannel(channelId: string): Promise<Result> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_youtube_channel", { p_channel_id: channelId });
  return result(error);
}
