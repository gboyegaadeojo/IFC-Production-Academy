"use server";

import { refresh } from "next/cache";
import { z } from "zod";
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

const emailChoice = z.object({
  kind: z.string().refine(isNotificationKind),
  email: z.boolean(),
});

/** Saves one email switch as soon as it changes (SRS-NOTIF-002). Safe to retry. */
export async function setEmailChoiceAction(kind: string, email: boolean): Promise<{ ok: boolean }> {
  const parsed = emailChoice.safeParse({ kind, email });
  if (!parsed.success || !isNotificationKind(parsed.data.kind) || !(await signedIn())) {
    return { ok: false };
  }
  return { ok: await setEmailPreference(parsed.data.kind, parsed.data.email) };
}
