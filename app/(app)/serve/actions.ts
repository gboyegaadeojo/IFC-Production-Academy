"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/components/ui/action-form";
import { requireActiveUser } from "@/lib/data/auth";
import {
  resetServiceChecklists,
  setChecklistItem,
  undoChecklistReset,
} from "@/lib/data/checklists";
import { checklistErrorMessage, type TickResult } from "@/lib/domain/checklists";

// Service-day checklists (decision record 9, stage 2). The database checks who is serving.

const tick = z.object({ eventId: z.uuid(), itemId: z.uuid(), checked: z.boolean() });

/** Ticks or unticks one item. Idempotent, so a retry after a dropped connection is safe. */
export async function setItemAction(input: {
  eventId: string;
  itemId: string;
  checked: boolean;
}): Promise<TickResult> {
  const parsed = tick.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: checklistErrorMessage("item_not_found") };
  }
  await requireActiveUser();
  const result = await setChecklistItem(
    parsed.data.eventId,
    parsed.data.itemId,
    parsed.data.checked,
  );
  if (!result.ok) {
    return { ok: false, message: checklistErrorMessage(result.error) };
  }
  refresh();
  return { ok: true };
}

const eventId = z.uuid();

export async function resetAction(_: FormState, formData: FormData): Promise<FormState> {
  const id = eventId.safeParse(formData.get("eventId"));
  if (!id.success) {
    return { status: "error", message: checklistErrorMessage("not_authorized") };
  }
  await requireActiveUser();
  const result = await resetServiceChecklists(id.data);
  if (!result.ok) {
    return { status: "error", message: checklistErrorMessage(result.error) };
  }
  refresh();
  return {
    status: "done",
    message: `Cleared ${result.value} ${result.value === 1 ? "tick" : "ticks"}. You can undo this.`,
  };
}

export async function undoResetAction(_: FormState, formData: FormData): Promise<FormState> {
  const id = eventId.safeParse(formData.get("eventId"));
  if (!id.success) {
    return { status: "error", message: checklistErrorMessage("not_authorized") };
  }
  await requireActiveUser();
  const result = await undoChecklistReset(id.data);
  if (!result.ok) {
    return { status: "error", message: checklistErrorMessage(result.error) };
  }
  refresh();
  return { status: "done", message: "Reset undone. The ticks are back." };
}
