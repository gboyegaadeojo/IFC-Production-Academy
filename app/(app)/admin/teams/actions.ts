"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/components/ui/action-form";
import { getAdminAccess } from "@/lib/data/admin/access";
import { addToServingTeam, removeFromServingTeam } from "@/lib/data/teams";
import { teamErrorMessage } from "@/lib/domain/teams";

// Position teams (decision record 9). The database checks team.manage for the department.

const input = z.object({ roleId: z.uuid(), userId: z.uuid() });

function parse(formData: FormData) {
  return input.safeParse({
    roleId: formData.get("roleId"),
    userId: formData.get("userId"),
  });
}

export async function addToTeamAction(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = parse(formData);
  if (!parsed.success) {
    return { status: "error", message: "Choose someone to add." };
  }
  if (!(await getAdminAccess("teams")).allowed) {
    return { status: "error", message: teamErrorMessage("not_authorized") };
  }
  const result = await addToServingTeam(parsed.data.roleId, parsed.data.userId);
  if (!result.ok) {
    return { status: "error", message: teamErrorMessage(result.error) };
  }
  refresh();
  return { status: "done", message: "Added. They can now be scheduled in this position." };
}

export async function removeFromTeamAction(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = parse(formData);
  if (!parsed.success || !(await getAdminAccess("teams")).allowed) {
    return { status: "error", message: teamErrorMessage("not_authorized") };
  }
  const result = await removeFromServingTeam(parsed.data.roleId, parsed.data.userId);
  if (!result.ok) {
    return { status: "error", message: teamErrorMessage(result.error) };
  }
  refresh();
  return {
    status: "done",
    message:
      "Taken off this position. Their training is kept, and any dates already scheduled stay.",
  };
}
