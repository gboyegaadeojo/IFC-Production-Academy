"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/components/ui/action-form";
import { getAdminAccess } from "@/lib/data/admin/access";
import { setLeadsService, setSeesAll } from "@/lib/data/checklists";
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

const leads = z.object({ roleId: z.uuid(), leads: z.enum(["true", "false"]) });

/** "Gets the Director role while scheduled": can reset and undo the service's checklists. */
export async function setLeadsAction(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = leads.safeParse({ roleId: formData.get("roleId"), leads: formData.get("leads") });
  if (!parsed.success || !(await getAdminAccess("teams")).allowed) {
    return { status: "error", message: teamErrorMessage("not_authorized") };
  }
  const result = await setLeadsService(parsed.data.roleId, parsed.data.leads === "true");
  if (!result.ok) {
    return { status: "error", message: teamErrorMessage("not_authorized") };
  }
  refresh();
  return {
    status: "done",
    message:
      parsed.data.leads === "true"
        ? "Whoever is scheduled here gets the Director role: they can reset and undo the checklists."
        : "This position no longer gets the Director role.",
  };
}

const seesAll = z.object({ roleId: z.uuid(), seesAll: z.enum(["true", "false"]) });

/** "Sees all departments": whoever is scheduled here sees every checklist by default. */
export async function setSeesAllAction(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = seesAll.safeParse({
    roleId: formData.get("roleId"),
    seesAll: formData.get("seesAll"),
  });
  if (!parsed.success || !(await getAdminAccess("teams")).allowed) {
    return { status: "error", message: teamErrorMessage("not_authorized") };
  }
  const result = await setSeesAll(parsed.data.roleId, parsed.data.seesAll === "true");
  if (!result.ok) {
    return { status: "error", message: teamErrorMessage("not_authorized") };
  }
  refresh();
  return {
    status: "done",
    message:
      parsed.data.seesAll === "true"
        ? "Whoever is scheduled here sees every department's checklist."
        : "Whoever is scheduled here sees their own checklist first.",
  };
}
