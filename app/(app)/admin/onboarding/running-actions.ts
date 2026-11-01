"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/components/ui/action-form";
import { getCurrentUser } from "@/lib/data/auth";
import * as onboarding from "@/lib/data/onboarding";

// Running onboarding: adding people, follow-ups, notes. The database checks who may do each.

const id = z.uuid();
const MESSAGES: Record<string, string> = {
  not_authorized: "You can only do that in pathways you look after.",
  already_taken: "Someone else has just taken this one.",
  already_in_pathway: "They're already in this pathway.",
  not_in_pool: "Choose someone who leads this onboarding.",
  completes_from_planning_center:
    "This one completes itself when the Planning Center sync sees them on the team.",
  invalid_person: "Enter their name and email address.",
  unknown: "That didn't save. Check your connection and try again.",
};
const failed = (error: string): FormState => ({
  status: "error",
  message: MESSAGES[error] ?? MESSAGES.unknown!,
});

async function active(): Promise<boolean> {
  return (await getCurrentUser())?.status === "active";
}

export async function addPersonAction(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = z
    .object({
      pathwayId: id,
      name: z.string().trim().min(1, "Enter their name.").max(120),
      email: z.email("Enter a valid email address.").max(254),
    })
    .safeParse({
      pathwayId: formData.get("pathwayId"),
      name: formData.get("name"),
      email: formData.get("email"),
    });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? MESSAGES.unknown! };
  }
  if (!(await active())) {
    return failed("not_authorized");
  }
  const added = await onboarding.addPerson(
    parsed.data.pathwayId,
    parsed.data.name,
    parsed.data.email,
  );
  if (!added.ok) {
    return failed(added.error);
  }
  refresh();
  return { status: "done", message: `${parsed.data.name} is in. Their first steps have started.` };
}

export async function completeTaskAction(_: FormState, formData: FormData): Promise<FormState> {
  const taskId = id.safeParse(formData.get("taskId"));
  if (!taskId.success || !(await active())) {
    return failed("not_authorized");
  }
  const done = await onboarding.completeTask(taskId.data);
  if (!done.ok) {
    return failed(done.error);
  }
  refresh();
  return { status: "done", message: "Done. They've moved on to their next step." };
}

export async function claimTaskAction(_: FormState, formData: FormData): Promise<FormState> {
  const taskId = id.safeParse(formData.get("taskId"));
  if (!taskId.success || !(await active())) {
    return failed("not_authorized");
  }
  const claimed = await onboarding.claimTask(taskId.data);
  if (!claimed.ok) {
    return failed(claimed.error);
  }
  refresh();
  return { status: "done", message: "It's yours. They'll see you as their contact." };
}

export async function assignTaskAction(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = z
    .object({ taskId: id, userId: id })
    .safeParse({ taskId: formData.get("taskId"), userId: formData.get("userId") });
  if (!parsed.success || !(await active())) {
    return failed("not_in_pool");
  }
  const assigned = await onboarding.assignTask(parsed.data.taskId, parsed.data.userId);
  if (!assigned.ok) {
    return failed(assigned.error);
  }
  refresh();
  return { status: "done", message: "Handed over. They'll see their new contact." };
}

export async function addNoteAction(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = z
    .object({
      entryId: id,
      body: z.string().trim().min(1, "Write the note.").max(2000),
      visibility: z.enum(["shared", "private"]),
    })
    .safeParse({
      entryId: formData.get("entryId"),
      body: formData.get("body"),
      visibility: formData.get("visibility"),
    });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? MESSAGES.unknown! };
  }
  if (!(await active())) {
    return failed("not_authorized");
  }
  const saved = await onboarding.addNote(
    parsed.data.entryId,
    parsed.data.body,
    parsed.data.visibility,
  );
  if (!saved.ok) {
    return failed(saved.error);
  }
  refresh();
  return {
    status: "done",
    message:
      parsed.data.visibility === "private"
        ? "Private note saved. Only you can read it."
        : "Note saved.",
  };
}

export async function stopEntryAction(_: FormState, formData: FormData): Promise<FormState> {
  const entryId = id.safeParse(formData.get("entryId"));
  if (!entryId.success || !(await active())) {
    return failed("not_authorized");
  }
  const stopped = await onboarding.stopEntry(entryId.data);
  if (!stopped.ok) {
    return failed(stopped.error);
  }
  refresh();
  return { status: "done", message: "Stopped. Their history is kept." };
}
