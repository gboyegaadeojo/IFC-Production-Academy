"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { FormState } from "@/components/ui/action-form";
import { getAdminAccess } from "@/lib/data/admin/access";
import { getCurrentUser } from "@/lib/data/auth";
import * as quizzes from "@/lib/data/quizzes";
import { curriculumErrorMessage, type CurriculumError } from "@/lib/domain/curriculum";
import {
  MAX_OPTIONS,
  newQuizSchema,
  questionSchema,
  quizErrorMessage,
  quizSettingsSchema,
} from "@/lib/domain/quiz";

// Quiz editing (SRS-QUIZ-001..003) works like lessons: drafts only, checked by row-level security.
// Extra attempts (SRS-QUIZ-004) need assessment.record, checked by the database.

const id = z.uuid();
const text = (value: FormDataEntryValue | null) => (typeof value === "string" ? value : "");

function error(message: string): FormState {
  return { status: "error", message };
}
function failed(code: CurriculumError): FormState {
  return error(curriculumErrorMessage(code));
}
function firstIssue(result: { error: z.ZodError }): FormState {
  return error(result.error.issues[0]?.message ?? curriculumErrorMessage("unknown"));
}

async function allowed(): Promise<boolean> {
  return (await getAdminAccess("curriculum")).allowed;
}

export async function addQuizAction(_: FormState, formData: FormData): Promise<FormState> {
  const versionId = id.safeParse(formData.get("versionId"));
  const courseId = id.safeParse(formData.get("courseId"));
  const quiz = newQuizSchema.safeParse({
    title: text(formData.get("title")),
    placement: formData.get("placement"),
  });
  if (!versionId.success || !courseId.success) {
    return failed("unknown");
  }
  if (!quiz.success) {
    return firstIssue(quiz);
  }
  if (!(await allowed())) {
    return failed("not_authorized");
  }
  const result = await quizzes.addQuiz(versionId.data, quiz.data);
  if (!result.ok) {
    return failed(result.error);
  }
  redirect(`/admin/curriculum/${courseId.data}/quizzes/${result.id}`);
}

export async function updateQuizAction(_: FormState, formData: FormData): Promise<FormState> {
  const quizId = id.safeParse(formData.get("quizId"));
  const settings = quizSettingsSchema.safeParse({
    title: text(formData.get("title")),
    intro: text(formData.get("intro")),
    placement: formData.get("placement"),
    passPercent: formData.get("passPercent"),
    maxAttempts: text(formData.get("maxAttempts")),
    answerPolicy: formData.get("answerPolicy"),
    shuffleQuestions: formData.get("shuffleQuestions") === "on",
    isRequired: formData.get("isRequired") === "on",
  });
  if (!quizId.success) {
    return failed("unknown");
  }
  if (!settings.success) {
    return firstIssue(settings);
  }
  if (!(await allowed())) {
    return failed("not_authorized");
  }
  const result = await quizzes.updateQuiz(quizId.data, settings.data);
  if (!result.ok) {
    return failed(result.error);
  }
  refresh();
  return { status: "done", message: "Saved to the draft." };
}

export async function deleteQuizAction(_: FormState, formData: FormData): Promise<FormState> {
  const quizId = id.safeParse(formData.get("quizId"));
  const courseId = id.safeParse(formData.get("courseId"));
  if (!quizId.success || !courseId.success || !(await allowed())) {
    return failed("not_authorized");
  }
  const result = await quizzes.deleteQuiz(quizId.data);
  if (!result.ok) {
    return failed(result.error);
  }
  redirect(`/admin/curriculum/${courseId.data}?tab=quizzes`);
}

/** Option rows arrive as repeated optionLabel fields; correct answers as their row numbers. */
function readQuestion(formData: FormData) {
  const labels = formData.getAll("optionLabel").slice(0, MAX_OPTIONS).map(text);
  const correct = new Set(formData.getAll("correct").map(text));
  const answer = text(formData.get("trueFalseAnswer"));
  return questionSchema.safeParse({
    kind: formData.get("kind"),
    prompt: text(formData.get("prompt")),
    scenario: text(formData.get("scenario")),
    explanation: text(formData.get("explanation")),
    options: labels.map((label, index) => ({ label, correct: correct.has(String(index)) })),
    trueFalseAnswer: answer === "" ? undefined : answer,
  });
}

export async function saveQuestionAction(_: FormState, formData: FormData): Promise<FormState> {
  const quizId = id.safeParse(formData.get("quizId"));
  const versionId = id.safeParse(formData.get("versionId"));
  const courseId = id.safeParse(formData.get("courseId"));
  const questionId = text(formData.get("questionId"));
  const question = readQuestion(formData);
  if (!quizId.success || !versionId.success || !courseId.success) {
    return failed("unknown");
  }
  if (!question.success) {
    return firstIssue(question);
  }
  if (!(await allowed())) {
    return failed("not_authorized");
  }
  if (questionId === "") {
    const result = await quizzes.addQuestion(quizId.data, versionId.data, question.data);
    if (!result.ok) {
      return failed(result.error);
    }
  } else {
    const existing = id.safeParse(questionId);
    if (!existing.success) {
      return failed("unknown");
    }
    const result = await quizzes.updateQuestion(existing.data, question.data);
    if (!result.ok) {
      return failed(result.error);
    }
  }
  redirect(`/admin/curriculum/${courseId.data}/quizzes/${quizId.data}`);
}

export async function deleteQuestionAction(_: FormState, formData: FormData): Promise<FormState> {
  const questionId = id.safeParse(formData.get("questionId"));
  if (!questionId.success || !(await allowed())) {
    return failed("not_authorized");
  }
  const result = await quizzes.deleteQuestion(questionId.data);
  if (!result.ok) {
    return failed(result.error);
  }
  refresh();
  return { status: "done", message: "Question removed from the draft." };
}

export async function moveQuestionAction(_: FormState, formData: FormData): Promise<FormState> {
  const questionId = id.safeParse(formData.get("questionId"));
  const direction = z.enum(["up", "down"]).safeParse(formData.get("direction"));
  if (!questionId.success || !direction.success || !(await allowed())) {
    return failed("not_authorized");
  }
  const result = await quizzes.moveQuestion(questionId.data, direction.data);
  if (!result.ok) {
    return failed(result.error);
  }
  refresh();
  return { status: "done", message: "Moved." };
}

export async function grantAttemptAction(_: FormState, formData: FormData): Promise<FormState> {
  const userId = id.safeParse(formData.get("userId"));
  const courseId = id.safeParse(formData.get("courseId"));
  const quizKey = id.safeParse(formData.get("quizKey"));
  const reason = z
    .string()
    .trim()
    .max(300)
    .safeParse(text(formData.get("reason")));
  if (!userId.success || !courseId.success || !quizKey.success || !reason.success) {
    return error(quizErrorMessage("unknown"));
  }
  if ((await getCurrentUser())?.status !== "active") {
    return error(quizErrorMessage("not_authorized"));
  }
  const result = await quizzes.grantQuizAttempt(
    userId.data,
    courseId.data,
    quizKey.data,
    reason.data,
  );
  if (!result.ok) {
    return error(
      result.error === "not_authorized"
        ? "Only trainers and leaders for this department can give extra attempts."
        : quizErrorMessage(result.error),
    );
  }
  refresh();
  return { status: "done", message: "They have one more attempt." };
}
