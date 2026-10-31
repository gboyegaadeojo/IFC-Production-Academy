"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/components/ui/action-form";
import { getCurrentUser } from "@/lib/data/auth";
import * as mentoring from "@/lib/data/mentoring";
import { goalSchema, mentoringErrorMessage, noteSchema } from "@/lib/domain/mentoring";

// Mentoring goals and notes (SRS-MENTOR-002..004). Row-level security decides who may write what:
// both people add goals and shared notes; only the mentor writes private notes.

const id = z.uuid();
const text = (value: FormDataEntryValue | null) => (typeof value === "string" ? value : "");

async function signedIn(): Promise<boolean> {
  return (await getCurrentUser())?.status === "active";
}
function error(message: string): FormState {
  return { status: "error", message };
}

export async function addGoalAction(_: FormState, formData: FormData): Promise<FormState> {
  const relationshipId = id.safeParse(formData.get("relationshipId"));
  const goal = goalSchema.safeParse({
    title: text(formData.get("title")),
    dueOn: text(formData.get("dueOn")),
  });
  if (!relationshipId.success) {
    return error(mentoringErrorMessage("unknown"));
  }
  if (!goal.success) {
    return error(goal.error.issues[0]?.message ?? "Check the goal.");
  }
  if (!(await signedIn())) {
    return error(mentoringErrorMessage("not_authorized"));
  }
  const result = await mentoring.addGoal(relationshipId.data, goal.data);
  if (!result.ok) {
    return error(mentoringErrorMessage(result.error));
  }
  refresh();
  return { status: "done", message: "Goal added." };
}

export async function setGoalStatusAction(_: FormState, formData: FormData): Promise<FormState> {
  const goalId = id.safeParse(formData.get("goalId"));
  const status = z.enum(["open", "done"]).safeParse(formData.get("status"));
  if (!goalId.success || !status.success || !(await signedIn())) {
    return error(mentoringErrorMessage("unknown"));
  }
  const result = await mentoring.setGoalStatus(goalId.data, status.data);
  if (!result.ok) {
    return error(mentoringErrorMessage(result.error));
  }
  refresh();
  return { status: "done", message: status.data === "done" ? "Marked done." : "Reopened." };
}

export async function addNoteAction(_: FormState, formData: FormData): Promise<FormState> {
  const relationshipId = id.safeParse(formData.get("relationshipId"));
  const note = noteSchema.safeParse({
    body: text(formData.get("body")),
    visibility: formData.get("visibility"),
  });
  if (!relationshipId.success) {
    return error(mentoringErrorMessage("unknown"));
  }
  if (!note.success) {
    return error(note.error.issues[0]?.message ?? "Check the note.");
  }
  if (!(await signedIn())) {
    return error(mentoringErrorMessage("not_authorized"));
  }
  const result = await mentoring.addNote(relationshipId.data, note.data);
  if (!result.ok) {
    return error(
      result.error === "not_authorized" && note.data.visibility === "private"
        ? "Private notes are for mentors who've been given private notes."
        : mentoringErrorMessage(result.error),
    );
  }
  refresh();
  return {
    status: "done",
    message: note.data.visibility === "private" ? "Saved privately." : "Shared.",
  };
}
