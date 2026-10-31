"use server";

import { cookies } from "next/headers";
import { sendMagicLink } from "@/lib/data/auth";
import { magicLinkRequestSchema } from "@/lib/domain/auth";
import { isInvitationToken, PENDING_INVITE_COOKIE } from "@/lib/domain/invitations";

/** On an error the typed address comes back, so the form keeps it for another try. */
export type MagicLinkState =
  | { status: "idle" }
  | { status: "sent"; email: string }
  | { status: "error"; message: string; email: string };

export async function requestMagicLink(
  _previous: MagicLinkState,
  formData: FormData,
): Promise<MagicLinkState> {
  const typed = formData.get("email");
  const email = typeof typed === "string" ? typed.slice(0, 320) : "";
  const parsed = magicLinkRequestSchema.safeParse({ email: typed });
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Enter a valid email address.",
      email,
    };
  }

  const result = await sendMagicLink(parsed.data.email);
  if (!result.ok) {
    return {
      status: "error",
      message: "We couldn't send the link just now. Wait a minute, then try again.",
      email,
    };
  }

  // Signing in from an invitation: remember it on this device so the email link returns to it.
  // It lasts as long as the email link does.
  const invite = formData.get("invite");
  if (isInvitationToken(invite)) {
    (await cookies()).set(PENDING_INVITE_COOKIE, invite, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60,
    });
  }
  return { status: "sent", email: parsed.data.email };
}
