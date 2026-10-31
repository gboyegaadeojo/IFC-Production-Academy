"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/components/ui/action-form";
import { getAdminAccess } from "@/lib/data/admin/access";
import * as mentoring from "@/lib/data/mentoring";
import { mentoringErrorMessage } from "@/lib/domain/mentoring";

// Pairing mentors (SRS-MENTOR-001). The database checks mentoring.assign, the mentor's
// eligibility, and the volunteer's membership. Pairings are audited.

const id = z.uuid();

function error(message: string): FormState {
  return { status: "error", message };
}

export async function assignMentorAction(_: FormState, formData: FormData): Promise<FormState> {
  const input = z.object({ departmentId: id, mentorId: id, menteeId: id }).safeParse({
    departmentId: formData.get("departmentId"),
    mentorId: formData.get("mentorId"),
    menteeId: formData.get("menteeId"),
  });
  if (!input.success) {
    return error("Choose a mentor and a volunteer.");
  }
  if (!(await getAdminAccess("mentoring")).allowed) {
    return error(mentoringErrorMessage("not_authorized"));
  }
  const result = await mentoring.assignMentor(
    input.data.departmentId,
    input.data.mentorId,
    input.data.menteeId,
  );
  if (!result.ok) {
    return error(mentoringErrorMessage(result.error));
  }
  refresh();
  return { status: "done", message: "Paired. They'll both see it under Mentoring." };
}

export async function endMentoringAction(_: FormState, formData: FormData): Promise<FormState> {
  const relationshipId = id.safeParse(formData.get("relationshipId"));
  const reason = z
    .string()
    .trim()
    .max(300)
    .safeParse(typeof formData.get("reason") === "string" ? formData.get("reason") : "");
  if (!relationshipId.success || !reason.success) {
    return error(mentoringErrorMessage("unknown"));
  }
  if (!(await getAdminAccess("mentoring")).allowed) {
    return error(mentoringErrorMessage("not_authorized"));
  }
  const result = await mentoring.endMentoring(relationshipId.data, reason.data);
  if (!result.ok) {
    return error(mentoringErrorMessage(result.error));
  }
  refresh();
  return { status: "done", message: "Ended. Their goals and notes are kept." };
}
