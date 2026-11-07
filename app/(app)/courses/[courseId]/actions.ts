"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { FormState } from "@/components/ui/action-form";
import { getCurrentUser } from "@/lib/data/auth";
import { getMyCapabilities } from "@/lib/data/capabilities";
import { issueCertificate } from "@/lib/data/certificates";
import { assignCourse, getAssignablePeople } from "@/lib/data/course-assignments";
import { restartCourse } from "@/lib/data/progress";
import { hasCapability } from "@/lib/domain/capabilities";
import { certificateErrorMessage } from "@/lib/domain/certificates";
import { assignedMessage, winnipegToday } from "@/lib/domain/course-assignments";

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

const assignment = z.object({
  courseId: z.uuid(),
  departmentId: z.uuid(),
  userId: z.uuid(),
  dueOn: z.union([z.literal(""), z.iso.date()]).transform((day) => day || null),
});

/**
 * Assigns this course to someone from its page, with an optional due date (ADD-REPORT-03; Actions
 * menu option 1, approved 2026-11-07). The database checks course.assign as well, and audits it.
 */
export async function assignFromCourseAction(_: FormState, formData: FormData): Promise<FormState> {
  const input = assignment.safeParse(Object.fromEntries(formData));
  if (!input.success) {
    return { status: "error", message: "Choose someone first." };
  }
  const { courseId, departmentId, userId, dueOn } = input.data;
  if (dueOn && dueOn < winnipegToday()) {
    return { status: "error", message: "Choose a due date from today on." };
  }
  if (!hasCapability(await getMyCapabilities(), "course.assign", departmentId)) {
    return { status: "error", message: "Only leaders can assign courses." };
  }
  const [outcome, people] = await Promise.all([
    assignCourse(courseId, userId, dueOn),
    getAssignablePeople(courseId),
  ]);
  if (!outcome) {
    return { status: "error", message: "That didn't work. Check your connection and try again." };
  }
  refresh();
  const name = people.find((person) => person.userId === userId)?.name ?? "them";
  return { status: "done", message: assignedMessage(outcome, name, dueOn) };
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
