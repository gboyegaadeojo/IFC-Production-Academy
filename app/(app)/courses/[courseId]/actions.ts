"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import type { FormState } from "@/components/ui/action-form";
import { getCurrentUser } from "@/lib/data/auth";
import { issueCertificate } from "@/lib/data/certificates";
import { certificateErrorMessage } from "@/lib/domain/certificates";

/**
 * Issues the learner's certificate once the database confirms the course's requirements
 * (SRS-CERT-001). Idempotent: an existing certificate opens instead.
 */
export async function issueCertificateAction(_: FormState, formData: FormData): Promise<FormState> {
  const courseId = z.uuid().safeParse(formData.get("courseId"));
  if (!courseId.success || (await getCurrentUser())?.status !== "active") {
    return { status: "error", message: certificateErrorMessage("unknown") };
  }
  const result = await issueCertificate(courseId.data);
  if (!result.ok) {
    return { status: "error", message: certificateErrorMessage(result.error) };
  }
  redirect(`/certificates/${result.reference}`);
}
