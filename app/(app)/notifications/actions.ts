"use server";

import { refresh } from "next/cache";
import type { FormState } from "@/components/ui/action-form";
import { getCurrentUser } from "@/lib/data/auth";
import { markAllRead, setEmailPreference } from "@/lib/data/notifications";
import { isNotificationKind } from "@/lib/domain/notifications";

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

/** Saves which kinds of notification also come by email (SRS-NOTIF-002). */
export async function saveEmailPreferencesAction(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!(await signedIn())) {
    return FAILED;
  }
  const kinds = formData.getAll("kind").filter((k): k is string => typeof k === "string");
  const on = new Set(formData.getAll("email").filter((k): k is string => typeof k === "string"));
  for (const kind of kinds) {
    if (!isNotificationKind(kind) || !(await setEmailPreference(kind, on.has(kind)))) {
      return FAILED;
    }
  }
  refresh();
  return { status: "done", message: "Email choices saved." };
}
