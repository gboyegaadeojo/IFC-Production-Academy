"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/components/ui/action-form";
import { getCurrentUser } from "@/lib/data/auth";
import {
  clearNotifications,
  getMyNotifications,
  markAllRead,
  setEmailPreference,
  setPhonePreference,
} from "@/lib/data/notifications";
import { formatDateTime } from "@/lib/domain/admin";
import {
  emailButtonLabel,
  isNotificationGroupId,
  isNotificationKind,
  NOTIFICATION_GROUPS,
  relativeTime,
  type NotificationKind,
} from "@/lib/domain/notifications";

const FAILED: FormState = {
  status: "error",
  message: "That didn't save. Check your connection and try again.",
};

async function signedIn(): Promise<boolean> {
  return (await getCurrentUser())?.status === "active";
}

export async function markAllReadAction(): Promise<FormState> {
  if (!(await signedIn()) || !(await markAllRead())) {
    return FAILED;
  }
  refresh();
  return { status: "done", message: "All caught up." };
}

const emailChoice = z.object({
  kind: z.string().refine(isNotificationKind),
  email: z.boolean(),
});

/** Saves one phone alert switch as soon as it changes (decision 2026-11-05). Safe to retry. */
export async function setPhoneChoiceAction(kind: string, on: boolean): Promise<{ ok: boolean }> {
  const parsed = emailChoice.safeParse({ kind, email: on });
  if (!parsed.success || !isNotificationKind(parsed.data.kind) || !(await signedIn())) {
    return { ok: false };
  }
  return { ok: await setPhonePreference(parsed.data.kind, parsed.data.email) };
}

/** Saves one email switch as soon as it changes (SRS-NOTIF-002). Safe to retry. */
export async function setEmailChoiceAction(kind: string, email: boolean): Promise<{ ok: boolean }> {
  const parsed = emailChoice.safeParse({ kind, email });
  if (!parsed.success || !isNotificationKind(parsed.data.kind) || !(await signedIn())) {
    return { ok: false };
  }
  return { ok: await setEmailPreference(parsed.data.kind, parsed.data.email) };
}

export type PanelNotification = {
  id: string;
  kind: NotificationKind;
  /** What following it does, such as "Confirm or decline". */
  action: string;
  title: string;
  body: string;
  href: string;
  /** "5m", "Yesterday": short, for the list. */
  when: string;
  /** The full date and time, for screen readers. */
  at: string;
  createdAt: string;
  read: boolean;
};

/** The newest notifications for the bell's panel, loaded when it opens (G, 2026-11-06). */
export async function latestNotificationsAction(): Promise<
  { ok: true; items: PanelNotification[] } | { ok: false }
> {
  const user = await getCurrentUser();
  if (user?.status !== "active") {
    return { ok: false };
  }
  try {
    const now = new Date();
    const items = (await getMyNotifications(user.id)).slice(0, 8).map((note) => ({
      id: note.id,
      kind: note.kind,
      action: emailButtonLabel(note.kind),
      title: note.title,
      body: note.body,
      href: note.link ?? "/notifications",
      when: relativeTime(note.createdAt, now),
      at: formatDateTime(note.createdAt),
      createdAt: note.createdAt,
      read: note.read,
    }));
    return { ok: true, items };
  } catch {
    return { ok: false };
  }
}

const groupChoiceInput = z.object({
  group: z.string().refine(isNotificationGroupId),
  channel: z.enum(["phone", "email"]),
  on: z.boolean(),
});

/**
 * Turns every kind in a group on or off for the phone or email, from one choice on the settings
 * page (G, 2026-11-06: fewer toggles). Safe to retry.
 */
export async function setGroupChoiceAction(
  group: string,
  channel: "phone" | "email",
  on: boolean,
): Promise<{ ok: boolean }> {
  const parsed = groupChoiceInput.safeParse({ group, channel, on });
  if (!parsed.success || !(await signedIn())) {
    return { ok: false };
  }
  const kinds = NOTIFICATION_GROUPS.find((g) => g.id === parsed.data.group)?.kinds ?? [];
  const save = parsed.data.channel === "phone" ? setPhonePreference : setEmailPreference;
  const saved = await Promise.all(kinds.map((kind) => save(kind, parsed.data.on)));
  return { ok: saved.every(Boolean) };
}

const clearInput = z.array(z.uuid()).min(1).max(500).nullable();

/**
 * Clears the given notifications, or every one with null (G, 2026-11-06). They leave the bell and
 * the list but are kept on record. Safe to retry.
 */
export async function clearNotificationsAction(ids: string[] | null): Promise<{ ok: boolean }> {
  const parsed = clearInput.safeParse(ids);
  if (!parsed.success || !(await signedIn())) {
    return { ok: false };
  }
  const ok = await clearNotifications(parsed.data);
  if (ok) {
    refresh();
  }
  return { ok };
}
