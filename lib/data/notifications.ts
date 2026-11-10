import "server-only";
import { getMyCapabilities } from "@/lib/data/capabilities";
import { createSupabaseServerClient } from "@/lib/data/supabase/server";
import { isNotificationKind, type NotificationKind } from "@/lib/domain/notifications";

// In-app notifications and email preferences (SRS-NOTIF-001..006). People read only their own.

export type AppNotification = {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  link: string | null;
  createdAt: string;
  read: boolean;
};

export async function getMyNotifications(userId: string): Promise<AppNotification[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("notifications")
    .select("id, kind, title, body, link, created_at, read_at")
    .eq("user_id", userId)
    .is("cleared_at", null)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    throw new Error("Could not load notifications", { cause: error.code });
  }
  return data.flatMap((row) =>
    isNotificationKind(row.kind)
      ? [
          {
            id: row.id,
            kind: row.kind,
            title: row.title,
            body: row.body,
            link: row.link,
            createdAt: row.created_at,
            read: row.read_at !== null,
          },
        ]
      : [],
  );
}

/**
 * The number for the app's icon: every unread notification and message together, as the alerts
 * carry it (supabase/migrations/20270119121100_app_badge.sql). Zero when it can't be read.
 */
export async function getAppBadge(): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("my_app_badge");
  return error ? 0 : (data ?? 0);
}

export async function getUnreadCount(userId: string): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("read_at", null)
    .is("cleared_at", null);
  return error ? 0 : (count ?? 0);
}

export async function markAllRead(): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("mark_notifications_read", { p_ids: null });
  return !error;
}

/** Hides the given notifications, or every one, from the bell and the list (G, 2026-11-06). */
export async function clearNotifications(ids: readonly string[] | null): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("clear_notifications", { p_ids: ids ? [...ids] : null });
  return !error;
}

export type NotificationChoices = {
  email: Map<NotificationKind, boolean>;
  phone: Map<NotificationKind, boolean>;
};

/** Email and phone alerts on or off per kind. A kind with no saved choice is on. */
export async function getMyNotificationChoices(userId: string): Promise<NotificationChoices> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("notification_preferences")
    .select("kind, email, push")
    .eq("user_id", userId);
  if (error) {
    throw new Error("Could not load preferences", { cause: error.code });
  }
  const rows = data.flatMap((row) =>
    isNotificationKind(row.kind) ? [{ ...row, kind: row.kind }] : [],
  );
  return {
    email: new Map(rows.map((row) => [row.kind, row.email])),
    phone: new Map(rows.map((row) => [row.kind, row.push])),
  };
}

/**
 * Whether to offer the Leading email choices: the person can record assessments, publish courses,
 * or manage a department, or they own an SOP.
 */
export async function offersLeadingChoices(userId: string): Promise<boolean> {
  const grants = await getMyCapabilities();
  if (grants.some((g) => LEADING_CAPABILITIES.has(g.capability))) {
    return true;
  }
  const supabase = await createSupabaseServerClient();
  const { count, error } = await supabase
    .from("sops")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", userId)
    .is("archived_at", null);
  return !error && (count ?? 0) > 0;
}

const LEADING_CAPABILITIES: ReadonlySet<string> = new Set([
  "assessment.record",
  "course.publish",
  "department.manage",
  "onboarding.manage",
]);

export async function setPhonePreference(kind: NotificationKind, push: boolean): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_notification_push", { p_kind: kind, p_push: push });
  return !error;
}

export async function setEmailPreference(kind: NotificationKind, email: boolean): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_notification_email", { p_kind: kind, p_email: email });
  return !error;
}
