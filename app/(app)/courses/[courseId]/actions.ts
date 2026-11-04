"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { FormState } from "@/components/ui/action-form";
import { getCurrentUser } from "@/lib/data/auth";
import { issueCertificate } from "@/lib/data/certificates";
import { restartCourse } from "@/lib/data/progress";
import { certificateErrorMessage } from "@/lib/domain/certificates";

/** Starts this person's course over, after they've confirmed it (SRS-PROG-009). */
export async function restartCourseAction(_: FormState, formData: FormData): Promise<FormState> {
  const courseId = z.uuid().safeParse(formData.get("courseId"));
  const failed: FormState = {
    status: "error",
    message:
      "That didn't work, and your progress hasn't changed. Check your connection and try again.",
  };
  if (!courseId.success || (await getCurrentUser())?.status !== "active") {
    return failed;
  }
  const result = await restartCourse(courseId.data);
  if (!result.ok) {
    return failed;
  }
  refresh();
  return { status: "done", message: "You're starting over." };
}

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
