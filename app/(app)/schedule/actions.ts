"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/components/ui/action-form";
import { getCurrentUser } from "@/lib/data/auth";
import * as schedule from "@/lib/data/schedule";
import { scheduleErrorMessage, unavailabilitySchema } from "@/lib/domain/schedule";

// A volunteer's own schedule (SRS-SCHED): confirm or decline, and mark unavailable days.

const text = (value: FormDataEntryValue | null) => (typeof value === "string" ? value : "");

async function signedIn(): Promise<boolean> {
  return (await getCurrentUser())?.status === "active";
}

export async function respondAction(_: FormState, formData: FormData): Promise<FormState> {
  const input = z
    .object({ assignmentId: z.uuid(), response: z.enum(["confirmed", "declined"]) })
    .safeParse({ assignmentId: formData.get("assignmentId"), response: formData.get("response") });
  if (!input.success || !(await signedIn())) {
    return { status: "error", message: scheduleErrorMessage("unknown") };
  }
  const result = await schedule.respondToAssignment(input.data.assignmentId, input.data.response);
  if (!result.ok) {
    return { status: "error", message: scheduleErrorMessage(result.error) };
  }
  refresh();
  return {
    status: "done",
    message:
      input.data.response === "confirmed"
        ? "Confirmed. Thank you!"
        : "Declined. Your leader will find someone else.",
  };
}

export async function addUnavailabilityAction(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const input = unavailabilitySchema.safeParse({
    startsOn: text(formData.get("startsOn")),
    endsOn: text(formData.get("endsOn")) || text(formData.get("startsOn")),
    note: text(formData.get("note")),
  });
  if (!input.success) {
    return { status: "error", message: input.error.issues[0]?.message ?? "Check the dates." };
  }
  if (!(await signedIn())) {
    return { status: "error", message: scheduleErrorMessage("not_authorized") };
  }
  const result = await schedule.addUnavailability(input.data);
  if (!result.ok) {
    return { status: "error", message: scheduleErrorMessage(result.error) };
  }
  refresh();
  return { status: "done", message: "Saved. Leaders will see you're away." };
}

export async function removeUnavailabilityAction(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success || !(await signedIn())) {
    return { status: "error", message: scheduleErrorMessage("unknown") };
  }
  const result = await schedule.removeUnavailability(id.data);
  if (!result.ok) {
    return { status: "error", message: scheduleErrorMessage(result.error) };
  }
  refresh();
  return { status: "done", message: "Removed." };
}

// Sign-ups and swaps (decision record 9, stage 3). The database runs every check.

const uuid = z.uuid();

async function run(
  id: FormDataEntryValue | null,
  call: (id: string) => Promise<schedule.ScheduleResult>,
  message: string,
): Promise<FormState> {
  const parsed = uuid.safeParse(id);
  if (!parsed.success || !(await signedIn())) {
    return { status: "error", message: scheduleErrorMessage("unknown") };
  }
  const result = await call(parsed.data);
  if (!result.ok) {
    return { status: "error", message: scheduleErrorMessage(result.error) };
  }
  refresh();
  return { status: "done", message };
}

export async function signUpAction(_: FormState, formData: FormData): Promise<FormState> {
  return run(
    formData.get("positionId"),
    schedule.signUpForPosition,
    "You're signed up. Thank you!",
  );
}

export async function takeCoverAction(_: FormState, formData: FormData): Promise<FormState> {
  return run(
    formData.get("requestId"),
    schedule.takeCover,
    "You're covering it. Thank you! They've been told.",
  );
}

export async function withdrawCoverAction(_: FormState, formData: FormData): Promise<FormState> {
  return run(
    formData.get("requestId"),
    schedule.withdrawCoverRequest,
    "Withdrawn. You're still scheduled.",
  );
}

export async function requestCoverAction(_: FormState, formData: FormData): Promise<FormState> {
  const note = z
    .string()
    .trim()
    .max(300, "Keep the note under 300 characters.")
    .safeParse(text(formData.get("note")));
  if (!note.success) {
    return { status: "error", message: note.error.issues[0]?.message ?? "Check the note." };
  }
  return run(
    formData.get("assignmentId"),
    (assignmentId) => schedule.requestCover(assignmentId, note.data),
    "Asked. Your teammates who are free have been told. You stay scheduled until someone takes it.",
  );
}
