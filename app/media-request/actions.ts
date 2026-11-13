"use server";

import { after } from "next/server";
import { z } from "zod";
import {
  createGraphicUploadSlot,
  kickApprovalEmails,
  submitCopyrightRequest,
} from "@/lib/data/copyright";
import { requestFormSchema } from "@/lib/domain/copyright";

export type RequestState =
  | { status: "idle" }
  | {
      status: "sent";
      firstName: string;
      reference: string | null;
      statusPath: string | null;
      isLate: boolean;
    }
  | { status: "error"; message: string };

const MESSAGES = {
  closed: "Requests are paused right now. Please ask the production team directly.",
  too_many:
    "You've sent several requests today. Please wait until tomorrow, or reply to one of our emails.",
  too_late:
    "That's too close to the date to check in time. Choose a later date, or ask the production team directly.",
  unknown_service: "Choose another date.",
  invalid: "Check the form and try again.",
  failed: "That didn't send. Check your connection and try again.",
};

const field = (formData: FormData, name: string) => {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
};

/**
 * The public video and graphics request form (ADD-COPY-01). Works signed out. Checked here and
 * again by the database, which also applies the switch, the daily limit and the deadline.
 */
export async function submitRequestAction(
  _: RequestState,
  formData: FormData,
): Promise<RequestState> {
  const parsed = requestFormSchema.safeParse({
    firstName: field(formData, "firstName"),
    lastName: field(formData, "lastName"),
    email: field(formData, "email"),
    kind: field(formData, "kind"),
    mediaUrl: field(formData, "mediaUrl"),
    filePath: field(formData, "filePath"),
    // A date only (G, 2026-11-13); the database links it to that day's service.
    eventId: "",
    otherDate: field(formData, "otherDate"),
    description: field(formData, "description"),
    website: field(formData, "website"),
  });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? MESSAGES.invalid };
  }
  const result = await submitCopyrightRequest(parsed.data);
  if (!result.ok) {
    return { status: "error", message: MESSAGES[result.error] };
  }
  // Emails go within a minute or two, not at the next 15-minute run (G, 2026-11-13).
  after(kickApprovalEmails);
  return {
    status: "sent",
    firstName: parsed.data.firstName,
    reference: result.reference,
    statusPath: result.statusToken ? `/media-request/status/${result.statusToken}` : null,
    isLate: result.isLate,
  };
}

const fileSchema = z.object({
  name: z.string().min(1).max(300),
  type: z.string().max(100),
  size: z.number().int().nonnegative(),
});

/** A one-time upload place for a graphic, which the browser then sends the file to. */
export async function graphicUploadAction(file: { name: string; type: string; size: number }) {
  const parsed = fileSchema.safeParse(file);
  if (!parsed.success) {
    return { ok: false as const, error: "Choose an image or PDF to upload." };
  }
  return createGraphicUploadSlot(parsed.data);
}
