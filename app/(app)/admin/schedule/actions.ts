"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { FormState } from "@/components/ui/action-form";
import { getAdminAccess } from "@/lib/data/admin/access";
import * as schedule from "@/lib/data/schedule";
import {
  eventSchema,
  overrideReasonSchema,
  READINESS_LABELS,
  scheduleErrorMessage,
} from "@/lib/domain/schedule";

// Scheduling for leaders (SRS-SCHED, workflow D). The database runs every check when someone is
// assigned; these actions only validate input.

const id = z.uuid();
const text = (value: FormDataEntryValue | null) => (typeof value === "string" ? value : "");

function error(message: string): FormState {
  return { status: "error", message };
}
async function allowed(): Promise<boolean> {
  return (await getAdminAccess("schedule")).allowed;
}

export async function createEventAction(_: FormState, formData: FormData): Promise<FormState> {
  const input = eventSchema.safeParse({
    title: text(formData.get("title")),
    date: text(formData.get("date")),
    startTime: text(formData.get("startTime")),
    endTime: text(formData.get("endTime")),
    location: text(formData.get("location")),
    notes: text(formData.get("notes")),
  });
  if (!input.success) {
    return error(input.error.issues[0]?.message ?? "Check the event details.");
  }
  if (!(await allowed())) {
    return error(scheduleErrorMessage("not_authorized"));
  }
  const result = await schedule.createEvent(input.data);
  if (!result.ok) {
    return error(scheduleErrorMessage(result.error));
  }
  redirect(`/admin/schedule/${result.value}`);
}

export async function cancelEventAction(_: FormState, formData: FormData): Promise<FormState> {
  const eventId = id.safeParse(formData.get("eventId"));
  if (!eventId.success || !(await allowed())) {
    return error(scheduleErrorMessage("not_authorized"));
  }
  const result = await schedule.cancelEvent(eventId.data);
  if (!result.ok) {
    return error(scheduleErrorMessage(result.error));
  }
  refresh();
  return { status: "done", message: "Event cancelled. Everyone's assignment was cancelled too." };
}

export async function addPositionAction(_: FormState, formData: FormData): Promise<FormState> {
  const eventId = id.safeParse(formData.get("eventId"));
  const roleId = id.safeParse(formData.get("roleId"));
  if (!eventId.success || !roleId.success) {
    return error("Choose a role.");
  }
  if (!(await allowed())) {
    return error(scheduleErrorMessage("not_authorized"));
  }
  const result = await schedule.addPosition(eventId.data, roleId.data);
  if (!result.ok) {
    return error(scheduleErrorMessage(result.error));
  }
  refresh();
  return { status: "done", message: "Position added." };
}

export async function removePositionAction(_: FormState, formData: FormData): Promise<FormState> {
  const positionId = id.safeParse(formData.get("positionId"));
  if (!positionId.success || !(await allowed())) {
    return error(scheduleErrorMessage("not_authorized"));
  }
  const result = await schedule.removePosition(positionId.data);
  if (!result.ok) {
    return error(scheduleErrorMessage(result.error));
  }
  refresh();
  return { status: "done", message: "Position removed." };
}

export async function assignAction(_: FormState, formData: FormData): Promise<FormState> {
  const positionId = id.safeParse(formData.get("positionId"));
  const userId = id.safeParse(formData.get("userId"));
  const supervisorRaw = text(formData.get("supervisorId"));
  const supervisorId = supervisorRaw === "" ? null : id.safeParse(supervisorRaw).data;
  const reason = overrideReasonSchema.safeParse(text(formData.get("overrideReason")));
  if (!positionId.success) {
    return error(scheduleErrorMessage("unknown"));
  }
  if (!userId.success) {
    return error("Choose who to schedule.");
  }
  if (supervisorId === undefined) {
    return error("Choose a supervisor from the list.");
  }
  if (!reason.success) {
    return error(reason.error.issues[0]?.message ?? "Check the reason.");
  }
  if (!(await allowed())) {
    return error(scheduleErrorMessage("not_authorized"));
  }
  const result = await schedule.assignToPosition({
    positionId: positionId.data,
    userId: userId.data,
    supervisorId,
    overrideReason: reason.data === "" ? null : reason.data,
  });
  if (!result.ok) {
    return error(scheduleErrorMessage(result.error));
  }
  refresh();
  return {
    status: "done",
    message: `Scheduled (${READINESS_LABELS[result.value].toLowerCase()}). They'll be asked to confirm.`,
  };
}

export async function cancelAssignmentAction(_: FormState, formData: FormData): Promise<FormState> {
  const assignmentId = id.safeParse(formData.get("assignmentId"));
  if (!assignmentId.success || !(await allowed())) {
    return error(scheduleErrorMessage("not_authorized"));
  }
  const result = await schedule.cancelAssignment(assignmentId.data);
  if (!result.ok) {
    return error(scheduleErrorMessage(result.error));
  }
  refresh();
  return { status: "done", message: "Assignment cancelled. The position is open again." };
}
