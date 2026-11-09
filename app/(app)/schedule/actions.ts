"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/components/ui/action-form";
import { getCurrentUser } from "@/lib/data/auth";
import * as schedule from "@/lib/data/schedule";
import { setMyPreferences } from "@/lib/data/auto-schedule";
import { resetMyCalendarFeed, stopMyCalendarFeed } from "@/lib/data/calendar-feed";
import { feedUrl } from "@/lib/domain/service-files";
import { publicEnv } from "@/lib/env";
import { preferencesSchema } from "@/lib/domain/auto-schedule";
import { blockoutSchema } from "@/lib/domain/blockouts";
import { scheduleErrorMessage } from "@/lib/domain/schedule";

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

export async function addBlockoutAction(_: FormState, formData: FormData): Promise<FormState> {
  const input = blockoutSchema.safeParse({
    kind: text(formData.get("kind")),
    startsOn: text(formData.get("startsOn")),
    endsOn: text(formData.get("endsOn")),
    startTime: text(formData.get("startTime")),
    endTime: text(formData.get("endTime")),
    repeat: text(formData.get("repeat")),
    note: text(formData.get("note")),
  });
  if (!input.success) {
    return { status: "error", message: input.error.issues[0]?.message ?? "Check the dates." };
  }
  if (!(await signedIn())) {
    return { status: "error", message: scheduleErrorMessage("not_authorized") };
  }
  const result = await schedule.addBlockout(input.data);
  if (!result.ok) {
    return { status: "error", message: scheduleErrorMessage(result.error) };
  }
  refresh();
  return {
    status: "done",
    message: "Saved. Schedulers will see you're away, and anyone scheduling you then is told.",
  };
}

export async function savePreferencesAction(_: FormState, formData: FormData): Promise<FormState> {
  const input = preferencesSchema.safeParse({
    maxPerMonth: text(formData.get("maxPerMonth")),
    householdMemberId: text(formData.get("householdMemberId")),
    householdMode: text(formData.get("householdMode")) || "together",
  });
  if (!input.success || !(await signedIn())) {
    return { status: "error", message: "Check your choices and try again." };
  }
  const result = await setMyPreferences(input.data);
  if (!result.ok) {
    return { status: "error", message: "That didn't save. Check your connection and try again." };
  }
  refresh();
  return { status: "done", message: "Saved. Auto-schedule follows these from now on." };
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

/** A new calendar link, shown once. Any old link stops working. */
export async function resetCalendarFeedAction(): Promise<FormState> {
  if (!(await signedIn())) {
    return { status: "error", message: scheduleErrorMessage("not_authorized") };
  }
  const token = await resetMyCalendarFeed();
  if (!token) {
    return { status: "error", message: "That didn't work. Check your connection and try again." };
  }
  refresh();
  return {
    status: "done",
    message: `Your link: ${feedUrl(publicEnv().NEXT_PUBLIC_SITE_URL, token)} Copy it into your calendar app now. It isn't shown again; make a new one if you lose it.`,
  };
}

export async function stopCalendarFeedAction(): Promise<FormState> {
  if (!(await signedIn())) {
    return { status: "error", message: scheduleErrorMessage("not_authorized") };
  }
  const ok = await stopMyCalendarFeed();
  if (!ok) {
    return { status: "error", message: "That didn't work. Check your connection and try again." };
  }
  refresh();
  return { status: "done", message: "Your calendar link has stopped working." };
}
