"use server";

import { z } from "zod";
import { submitInterest } from "@/lib/data/onboarding";

export type InterestState =
  { status: "idle" } | { status: "sent"; firstName: string } | { status: "error"; message: string };

const interest = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter your name.")
    .max(120, "Keep your name under 120 characters."),
  email: z.email("Enter a valid email address.").max(254),
  phone: z.string().trim().max(40, "Keep the phone number short."),
  message: z.string().trim().max(1000, "Keep the message under 1,000 characters."),
  interests: z.array(z.uuid()).max(20),
  // A field people never see. Bots fill it in; the database quietly ignores those.
  website: z.string().max(200),
});

/**
 * The public "I want to serve" form (docs/decisions/2026-11-01-onboarding-pathways.md). Works
 * signed out. It always answers the same way, so it never reveals whether an email is known.
 */
export async function submitInterestAction(
  _: InterestState,
  formData: FormData,
): Promise<InterestState> {
  const parsed = interest.safeParse({
    name: formData.get("name") ?? "",
    email: formData.get("email") ?? "",
    phone: formData.get("phone") ?? "",
    message: formData.get("message") ?? "",
    interests: formData.getAll("interests").filter((v): v is string => typeof v === "string"),
    website: formData.get("website") ?? "",
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Check the form and try again.",
    };
  }
  const sent = await submitInterest(parsed.data);
  if (!sent.ok) {
    return { status: "error", message: "That didn't send. Check your connection and try again." };
  }
  return { status: "sent", firstName: parsed.data.name.split(/\s+/)[0] ?? parsed.data.name };
}
