import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/data/database.types";
import { createSupabaseServerClient } from "@/lib/data/supabase/server";
import { publicEnv } from "@/lib/env";
import {
  isAppPlatform,
  toAlertStatus,
  type AlertStatus,
  type AppPlatform,
} from "@/lib/domain/alerts";
import { badgesByEndpoint } from "@/lib/domain/app-badge";
import { pushMessageFor, sendPush, type PushMessage, type VapidKeys } from "@/lib/domain/web-push";

/**
 * Web push for the Academy (supabase/migrations/20261210120000_push_alerts.sql). The VAPID private
 * key is a Cloudflare secret; the public key is public by design. Nothing here logs addresses,
 * names, or content.
 */
export function vapidKeys(): VapidKeys | null {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) {
    return null;
  }
  return { publicKey, privateKey, subject: publicEnv().NEXT_PUBLIC_SITE_URL };
}

/** A client with only the public key and no session: the dispatch calls check the token instead. */
function anonClient() {
  const env = publicEnv();
  return createClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    },
  );
}

export type DispatchResult = { ok: boolean; sent: number; gone: number; failed: number };

/** Sends the alerts for one new notification, once. Called by the database through pg_net. */
export async function dispatchNotification(id: string, token: string): Promise<DispatchResult> {
  const vapid = vapidKeys();
  if (!vapid) {
    // Leave it pending for the 15-minute job, which may have the keys.
    return { ok: false, sent: 0, gone: 0, failed: 0 };
  }
  const supabase = anonClient();
  const { data, error } = await supabase.rpc("claim_push", {
    p_notification_id: id,
    p_token: token,
  });
  if (error) {
    return { ok: false, sent: 0, gone: 0, failed: 0 };
  }
  const result: DispatchResult = { ok: true, sent: 0, gone: 0, failed: 0 };
  // The number for each device's icon; without it the alert still goes, just without a number.
  const badges = badgesByEndpoint(
    data.length
      ? (
          await supabase.rpc("push_badges", {
            p_endpoints: data.map((row) => row.endpoint),
            p_token: token,
          })
        ).data
      : [],
  );
  await Promise.all(
    data.map(async (row) => {
      const outcome = await sendPush(
        row,
        {
          ...pushMessageFor({ id, title: row.title, body: row.body, link: row.link }),
          badge: badges.get(row.endpoint),
        },
        vapid,
      );
      result[outcome === "sent" ? "sent" : outcome === "gone" ? "gone" : "failed"] += 1;
      if (outcome === "gone") {
        await supabase.rpc("push_subscription_gone", { p_endpoint: row.endpoint, p_token: token });
      }
    }),
  );
  return result;
}

export type DeviceSubscription = { endpoint: string; p256dh: string; auth: string };

export async function saveMySubscription(
  subscription: DeviceSubscription,
  label: string,
): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("save_push_subscription", {
    p_endpoint: subscription.endpoint,
    p_p256dh: subscription.p256dh,
    p_auth: subscription.auth,
    p_label: label,
  });
  return !error;
}

export async function removeMySubscription(endpoint: string): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("remove_push_subscription", { p_endpoint: endpoint });
  return !error;
}

/** "Send a test alert": straight to one of your own devices, with no notification written. */
export async function sendTestAlert(endpoint: string): Promise<"sent" | "gone" | "failed" | "off"> {
  const vapid = vapidKeys();
  if (!vapid) {
    return "off";
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("endpoint", endpoint)
    .maybeSingle();
  if (error || !data) {
    return "failed";
  }
  const message: PushMessage = {
    title: "Alerts are on",
    body: "This is how updates from the Academy will look on this device.",
    url: "/notifications",
    tag: "test-alert",
  };
  const outcome = await sendPush(data, message, vapid);
  if (outcome === "gone") {
    await removeMySubscription(endpoint);
  }
  return outcome;
}

export type MyDevice = { id: string; label: string; addedAt: string };

/** Your devices with alerts on, newest first (RLS shows only your own). */
export type TeamAlertRow = {
  userId: string;
  displayName: string;
  departments: string[];
  status: AlertStatus;
  devices: string[];
  lastSentAt: string | null;
  /** Kinds of device they've opened the installed app on. */
  appPlatforms: AppPlatform[];
  /** Notification kinds they've switched off for their phone. */
  pushOffKinds: string[];
};

/** Who on the teams this person may see has alerts on (alerts.view, checked in the database). */
export async function getTeamAlertStatus(): Promise<TeamAlertRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("team_alert_status");
  if (error) {
    throw new Error("Could not load phone alerts", { cause: error.code });
  }
  return data.map((row) => ({
    userId: row.user_id,
    displayName: row.display_name,
    departments: row.departments,
    status: toAlertStatus(row.status),
    devices: row.devices,
    lastSentAt: row.last_sent_at,
    appPlatforms: row.app_platforms.filter(isAppPlatform),
    pushOffKinds: row.push_off_kinds,
  }));
}

/** Notes that the signed-in person opened the installed app on this kind of device. */
export async function recordAppOpen(platform: AppPlatform): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("record_app_open", { p_platform: platform });
  return !error;
}

/** Whether to ask this person to set up alerts: on a team, no phone on, no exception. */
export async function getAlertsSetupNeeded(): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("alerts_setup_needed");
  return !error && data === true;
}

/** Whether this person has said their phone can't do alerts. */
export async function getMyAlertException(): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("alert_exceptions").select("user_id").maybeSingle();
  return !error && data !== null;
}

export async function setAlertsUnavailable(unavailable: boolean): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_alerts_unavailable", { p_unavailable: unavailable });
  return !error;
}

export async function getMyDevices(): Promise<MyDevice[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("id, device_label, created_at")
    .order("created_at", { ascending: false });
  if (error) {
    return [];
  }
  return data.map((d) => ({
    id: d.id,
    label: d.device_label || "A device",
    addedAt: d.created_at,
  }));
}

/** Turns alerts off for one of your devices, by its id (for a device you no longer have). */
export async function removeMyDevice(id: string): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("endpoint")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) {
    return false;
  }
  return removeMySubscription(data.endpoint);
}
