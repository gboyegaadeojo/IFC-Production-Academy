"use server";

import { z } from "zod";
import { getCurrentUser } from "@/lib/data/auth";
import { removeMySubscription, saveMySubscription, sendTestAlert } from "@/lib/data/push";

const base64Url = (min: number, max: number) =>
  z
    .string()
    .regex(/^[A-Za-z0-9_-]+$/)
    .min(min)
    .max(max);
const Subscription = z.object({
  endpoint: z.url().startsWith("https://").max(1000),
  p256dh: base64Url(80, 100),
  auth: base64Url(16, 32),
});

/** Turns alerts on for this device (the browser's push subscription). */
export async function savePushSubscriptionAction(input: {
  subscription: unknown;
  label: string;
}): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  const parsed = Subscription.safeParse(input.subscription);
  const label = z.string().max(80).safeParse(input.label);
  if (!user || user.status !== "active" || !parsed.success) {
    return { ok: false };
  }
  return { ok: await saveMySubscription(parsed.data, label.success ? label.data : "") };
}

export async function removePushSubscriptionAction(endpoint: string): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  const parsed = z.url().max(1000).safeParse(endpoint);
  if (!user || !parsed.success) {
    return { ok: false };
  }
  return { ok: await removeMySubscription(parsed.data) };
}

export async function sendTestAlertAction(
  endpoint: string,
): Promise<{ outcome: "sent" | "gone" | "failed" | "off" }> {
  const user = await getCurrentUser();
  const parsed = z.url().max(1000).safeParse(endpoint);
  if (!user || user.status !== "active" || !parsed.success) {
    return { outcome: "failed" };
  }
  return { outcome: await sendTestAlert(parsed.data) };
}
