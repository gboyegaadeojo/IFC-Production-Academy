"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import type { FormState } from "@/components/ui/action-form";
import { getAdminAccess } from "@/lib/data/admin/access";
import { applyProposal } from "@/lib/data/auto-schedule";
import { proposalItemsSchema } from "@/lib/domain/auto-schedule";
import { scheduleErrorMessage } from "@/lib/domain/schedule";

/** Keeps the suggested people, as "Not sent yet" (plan "Academy scheduling", PR 8). */
export async function keepProposalAction(_: FormState, formData: FormData): Promise<FormState> {
  const typeId = z.uuid().safeParse(formData.get("typeId"));
  let raw: unknown = null;
  try {
    raw = JSON.parse(String(formData.get("items") ?? ""));
  } catch {
    raw = null;
  }
  const items = proposalItemsSchema.safeParse(raw);
  if (!typeId.success || !(await getAdminAccess("schedule")).allowed) {
    return { status: "error", message: scheduleErrorMessage("not_authorized") };
  }
  if (!items.success) {
    return { status: "error", message: items.error.issues[0]?.message ?? "There's nobody to add." };
  }
  const result = await applyProposal(items.data);
  if (!result.ok) {
    return { status: "error", message: scheduleErrorMessage(result.error) };
  }
  redirect(`/admin/schedule/matrix?type=${typeId.data}&kept=${result.value}`);
}
