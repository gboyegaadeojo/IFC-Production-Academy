"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/components/ui/action-form";
import { getCurrentUser } from "@/lib/data/auth";
import * as progress from "@/lib/data/progress";

// Lesson progress (SRS-PROG-001..005). The database checks membership and that the lesson is live;
// every call is idempotent, so a retry or a double tap is harmless (SRS-PROG-004).

const lessonInput = z.object({ courseId: z.uuid(), lessonKey: z.uuid() });
const position = z.number().int().min(0).max(86400).nullable();

async function signedIn(): Promise<boolean> {
  return (await getCurrentUser())?.status === "active";
}

/**
 * Records that the lesson was opened and where the video is, for resuming on another device
 * (SRS-PROG-003). An informal signal only: failures are ignored and nothing is inferred from it.
 */
export async function recordLessonViewAction(
  courseId: string,
  lessonKey: string,
  positionSeconds: number | null,
): Promise<void> {
  const input = lessonInput.safeParse({ courseId, lessonKey });
  const seconds = position.safeParse(positionSeconds === null ? null : Math.floor(positionSeconds));
  if (!input.success || !seconds.success || !(await signedIn())) {
    return;
  }
  await progress.recordLessonView(input.data.courseId, input.data.lessonKey, seconds.data);
}

function parse(formData: FormData) {
  return lessonInput.safeParse({
    courseId: formData.get("courseId"),
    lessonKey: formData.get("lessonKey"),
  });
}

const FAILED: FormState = {
  status: "error",
  message: "That didn't save. Check your connection and try again.",
};
const NOT_MEMBER: FormState = {
  status: "error",
  message: "Only members of this department can track lessons.",
};

/** The learner marks the lesson complete. Completion is their action, never a watch check. */
export async function completeLessonAction(_: FormState, formData: FormData): Promise<FormState> {
  const input = parse(formData);
  if (!input.success || !(await signedIn())) {
    return FAILED;
  }
  const result = await progress.completeLesson(input.data.courseId, input.data.lessonKey);
  if (!result.ok) {
    return result.error === "not_authorized" ? NOT_MEMBER : FAILED;
  }
  refresh();
  return { status: "done", message: "Marked complete." };
}

export async function reopenLessonAction(_: FormState, formData: FormData): Promise<FormState> {
  const input = parse(formData);
  if (!input.success || !(await signedIn())) {
    return FAILED;
  }
  const result = await progress.reopenLesson(input.data.courseId, input.data.lessonKey);
  if (!result.ok) {
    return result.error === "not_authorized" ? NOT_MEMBER : FAILED;
  }
  refresh();
  return { status: "done", message: "Marked as not complete." };
}
