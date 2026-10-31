"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/components/ui/action-form";
import { getCurrentUser } from "@/lib/data/auth";
import { revokeCertificate } from "@/lib/data/certificates";
import { certificateErrorMessage, normaliseReference } from "@/lib/domain/certificates";
import { suspendReasonSchema } from "@/lib/domain/competency";

/** Revokes a certificate (SRS-CERT-005). The database checks competency.approve and audits it. */
export async function revokeCertificateAction(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const reference = normaliseReference(z.string().catch("").parse(formData.get("reference")));
  const reason = suspendReasonSchema.safeParse(formData.get("reason"));
  if (!reference) {
    return { status: "error", message: certificateErrorMessage("unknown") };
  }
  if (!reason.success) {
    return { status: "error", message: reason.error.issues[0]?.message ?? "Say why." };
  }
  if ((await getCurrentUser())?.status !== "active") {
    return { status: "error", message: certificateErrorMessage("not_authorized") };
  }
  const result = await revokeCertificate(reference, reason.data);
  if (!result.ok) {
    return { status: "error", message: certificateErrorMessage(result.error) };
  }
  refresh();
  return { status: "done", message: "Certificate withdrawn. The record is kept." };
}
