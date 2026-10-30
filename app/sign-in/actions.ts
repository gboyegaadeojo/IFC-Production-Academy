"use server";

import { redirect } from "next/navigation";
import { sendMagicLink, startGoogleSignIn } from "@/lib/data/auth";
import { magicLinkRequestSchema, safeNextPath } from "@/lib/domain/auth";

export type MagicLinkState =
  { status: "idle" } | { status: "sent"; email: string } | { status: "error"; message: string };

function nextFrom(formData: FormData): string {
  const next = formData.get("next");
  return safeNextPath(typeof next === "string" ? next : null);
}

export async function requestMagicLink(
  _previous: MagicLinkState,
  formData: FormData,
): Promise<MagicLinkState> {
  const parsed = magicLinkRequestSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Enter a valid email address.",
    };
  }

  const result = await sendMagicLink(parsed.data.email);
  if (!result.ok) {
    return {
      status: "error",
      message: "We couldn't send the link just now. Wait a minute, then try again.",
    };
  }
  return { status: "sent", email: parsed.data.email };
}

export async function signInWithGoogle(formData: FormData): Promise<void> {
  const url = await startGoogleSignIn(nextFrom(formData));
  redirect(url ?? "/sign-in?error=oauth_failed");
}
