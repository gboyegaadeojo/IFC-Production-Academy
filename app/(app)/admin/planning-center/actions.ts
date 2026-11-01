"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/components/ui/action-form";
import { getAdminAccess } from "@/lib/data/admin/access";
import {
  requestPcoRefresh,
  setPcoLink,
  setSchedulingSource,
  type RefreshResult,
} from "@/lib/data/planning-center";

// Planning Center settings (decision record 9, revised). The database checks team.manage for
// links and schedule.manage (organisation-wide) for who schedules.

const link = z.object({
  teamId: z.string().min(1).max(40),
  positionId: z
    .string()
    .max(40)
    .transform((value) => (value === "" ? null : value)),
  roleId: z.union([z.literal("").transform(() => null), z.uuid()]),
});

export async function setLinkAction(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = link.safeParse({
    teamId: formData.get("teamId"),
    positionId: formData.get("positionId") ?? "",
    roleId: formData.get("roleId") ?? "",
  });
  if (!parsed.success || !(await getAdminAccess("planning-center")).allowed) {
    return { status: "error", message: "Only people who run the teams can change links." };
  }
  const ok = await setPcoLink(parsed.data.teamId, parsed.data.positionId, parsed.data.roleId);
  if (!ok) {
    return {
      status: "error",
      message: "That didn't save. You can only link to positions in departments you run.",
    };
  }
  refresh();
  return {
    status: "done",
    message: parsed.data.roleId
      ? "Linked. It applies from the next sync, within 15 minutes."
      : "Unlinked. It applies from the next sync.",
  };
}

export async function setSourceAction(_: FormState, formData: FormData): Promise<FormState> {
  const source = z.enum(["academy", "planning_center"]).safeParse(formData.get("source"));
  if (!source.success || !(await getAdminAccess("planning-center")).allowed) {
    return { status: "error", message: "Only organisation-wide schedulers can change this." };
  }
  const ok = await setSchedulingSource(source.data);
  if (!ok) {
    return { status: "error", message: "Only organisation-wide schedulers can change this." };
  }
  refresh();
  return {
    status: "done",
    message:
      source.data === "planning_center"
        ? "Planning Center schedules. The Academy shows what it reads from there."
        : "The Academy schedules. Planning Center is no longer read.",
  };
}

const REFRESH_MESSAGES: Record<Exclude<RefreshResult, "requested">, string> = {
  too_soon: "A refresh was asked for in the last two minutes. It's on its way.",
  not_authorized: "Only people who run the teams can refresh from Planning Center.",
  not_set_up: "Refreshing on demand isn't set up yet. The next read is within 15 minutes.",
  failed: "That didn't reach GitHub. The next read is within 15 minutes.",
};

/** Refresh from Planning Center now (checklist app US-15, C29). */
export async function refreshAction(): Promise<FormState> {
  if (!(await getAdminAccess("planning-center")).allowed) {
    return { status: "error", message: REFRESH_MESSAGES.not_authorized };
  }
  const result = await requestPcoRefresh();
  if (result !== "requested") {
    return { status: "error", message: REFRESH_MESSAGES[result] };
  }
  refresh();
  return {
    status: "done",
    message: "Reading Planning Center now. Reload in a minute or two to see what changed.",
  };
}
