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
