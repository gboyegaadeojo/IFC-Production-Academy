"use server";

import { sendMagicLink } from "@/lib/data/auth";
import { magicLinkRequestSchema } from "@/lib/domain/auth";

export type MagicLinkState =
  { status: "idle" } | { status: "sent"; email: string } | { status: "error"; message: string };

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
