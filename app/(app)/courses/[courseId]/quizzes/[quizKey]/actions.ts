"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { FormState } from "@/components/ui/action-form";
import { getCurrentUser } from "@/lib/data/auth";
import * as quizzes from "@/lib/data/quizzes";
import { answersSchema, quizErrorMessage, type Answers } from "@/lib/domain/quiz";

// Taking a quiz (SRS-QUIZ-002..006). The database checks membership and the attempt limit, and
// scores the attempt itself. Both calls are idempotent, so a retry or a double tap is harmless.

const quizInput = z.object({ courseId: z.uuid(), quizKey: z.uuid() });

async function signedIn(): Promise<boolean> {
  return (await getCurrentUser())?.status === "active";
}

/** Starts an attempt, or picks up the one in progress, and opens it. */
export async function startQuizAction(_: FormState, formData: FormData): Promise<FormState> {
  const input = quizInput.safeParse({
    courseId: formData.get("courseId"),
    quizKey: formData.get("quizKey"),
  });
  if (!input.success || !(await signedIn())) {
    return { status: "error", message: quizErrorMessage("unknown") };
  }
  const result = await quizzes.startQuizAttempt(input.data.courseId, input.data.quizKey);
  if (!result.ok) {
    return { status: "error", message: quizErrorMessage(result.error) };
  }
  redirect(`/courses/${input.data.courseId}/quizzes/${input.data.quizKey}/attempts/${result.id}`);
}

/** Sends the answers to be scored. The page then shows the result. */
export async function submitQuizAction(attemptId: string, answers: Answers): Promise<FormState> {
  const id = z.uuid().safeParse(attemptId);
  const parsed = answersSchema.safeParse(answers);
  if (!id.success || !parsed.success) {
    return { status: "error", message: quizErrorMessage("invalid_answers") };
  }
  if (!(await signedIn())) {
    return { status: "error", message: quizErrorMessage("not_authorized") };
  }
  const result = await quizzes.submitQuizAttempt(id.data, parsed.data);
  if (!result.ok) {
    return { status: "error", message: quizErrorMessage(result.error) };
  }
  refresh();
  return { status: "done", message: result.id ? "You passed." : "Submitted." };
}
