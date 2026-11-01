"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { FormState } from "@/components/ui/action-form";
import { getAdminAccess } from "@/lib/data/admin/access";
import * as types from "@/lib/data/service-types";
import {
  createServicesSchema,
  movePosition,
  serviceTypeErrorMessage,
  serviceTypeSchema,
  withoutPosition,
  withPosition,
} from "@/lib/domain/service-types";

// Service types (decision record 9, stage 1). The database checks schedule.manage on every write.

const id = z.uuid();
const text = (value: FormDataEntryValue | null) => (typeof value === "string" ? value : "");

function error(message: string): FormState {
  return { status: "error", message };
}
async function allowed(): Promise<boolean> {
  return (await getAdminAccess("schedule")).allowed;
}

function parseType(formData: FormData) {
  return serviceTypeSchema.safeParse({
    name: text(formData.get("name")),
    startTime: text(formData.get("startTime")),
    durationMinutes: text(formData.get("durationMinutes")),
    location: text(formData.get("location")),
    notes: text(formData.get("notes")),
  });
}

export async function createServiceTypeAction(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const input = parseType(formData);
  if (!input.success) {
    return error(input.error.issues[0]?.message ?? "Check the details.");
  }
  if (!(await allowed())) {
    return error(serviceTypeErrorMessage("not_authorized"));
  }
  const result = await types.saveServiceType(null, input.data);
  if (!result.ok) {
    return error(serviceTypeErrorMessage(result.error));
  }
  redirect(`/admin/schedule/types/${result.value}`);
}

export async function updateServiceTypeAction(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const typeId = id.safeParse(formData.get("typeId"));
  const input = parseType(formData);
  if (!typeId.success) {
    return error(serviceTypeErrorMessage("not_found"));
  }
  if (!input.success) {
    return error(input.error.issues[0]?.message ?? "Check the details.");
  }
  if (!(await allowed())) {
    return error(serviceTypeErrorMessage("not_authorized"));
  }
  const result = await types.saveServiceType(typeId.data, input.data);
  if (!result.ok) {
    return error(serviceTypeErrorMessage(result.error));
  }
  refresh();
  return { status: "done", message: "Saved. Services already made keep their times." };
}

export async function setTypeSignupsAction(_: FormState, formData: FormData): Promise<FormState> {
  const typeId = id.safeParse(formData.get("typeId"));
  const open = z.enum(["true", "false"]).safeParse(formData.get("open"));
  if (!typeId.success || !open.success || !(await allowed())) {
    return error(serviceTypeErrorMessage("not_authorized"));
  }
  const result = await types.setServiceTypeSignups(typeId.data, open.data === "true");
  if (!result.ok) {
    return error(serviceTypeErrorMessage(result.error));
  }
  refresh();
  return {
    status: "done",
    message:
      open.data === "true"
        ? "Services made from now on open sign-ups."
        : "Services made from now on keep sign-ups closed.",
  };
}

export async function archiveServiceTypeAction(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const typeId = id.safeParse(formData.get("typeId"));
  if (!typeId.success || !(await allowed())) {
    return error(serviceTypeErrorMessage("not_authorized"));
  }
  const result = await types.archiveServiceType(typeId.data);
  if (!result.ok) {
    return error(serviceTypeErrorMessage(result.error));
  }
  redirect("/admin/schedule/types");
}

const positionChange = z.discriminatedUnion("op", [
  z.object({ op: z.literal("add"), roleId: z.uuid() }),
  z.object({ op: z.literal("remove"), index: z.coerce.number().int().min(0) }),
  z.object({ op: z.literal("up"), index: z.coerce.number().int().min(0) }),
  z.object({ op: z.literal("down"), index: z.coerce.number().int().min(0) }),
]);

export async function changePositionsAction(_: FormState, formData: FormData): Promise<FormState> {
  const typeId = id.safeParse(formData.get("typeId"));
  const change = positionChange.safeParse({
    op: formData.get("op"),
    roleId: formData.get("roleId") ?? undefined,
    index: formData.get("index") ?? undefined,
  });
  if (!typeId.success || !change.success) {
    return error("Choose a position.");
  }
  if (!(await allowed())) {
    return error(serviceTypeErrorMessage("not_authorized"));
  }
  const current = await types.getServiceType(typeId.data);
  if (!current) {
    return error(serviceTypeErrorMessage("not_found"));
  }
  const roleIds = current.positions.map((p) => p.roleId);
  const next =
    change.data.op === "add"
      ? withPosition(roleIds, change.data.roleId)
      : change.data.op === "remove"
        ? withoutPosition(roleIds, change.data.index)
        : movePosition(roleIds, change.data.index, change.data.op === "up" ? -1 : 1);
  const result = await types.setServiceTypePositions(typeId.data, next);
  if (!result.ok) {
    return error(serviceTypeErrorMessage(result.error));
  }
  refresh();
  return {
    status: "done",
    message: change.data.op === "add" ? "Position added." : "Positions updated.",
  };
}

export async function createServicesAction(_: FormState, formData: FormData): Promise<FormState> {
  const typeId = id.safeParse(formData.get("typeId"));
  const dates = createServicesSchema.safeParse({
    firstDate: text(formData.get("firstDate")),
    count: text(formData.get("count")),
    everyWeeks: text(formData.get("everyWeeks")) || "1",
  });
  if (!typeId.success) {
    return error(serviceTypeErrorMessage("not_found"));
  }
  if (!dates.success) {
    return error(dates.error.issues[0]?.message ?? "Check the dates.");
  }
  if (!(await allowed())) {
    return error(serviceTypeErrorMessage("not_authorized"));
  }
  const result = await types.createServices(typeId.data, dates.data);
  if (!result.ok) {
    return error(serviceTypeErrorMessage(result.error));
  }
  refresh();
  const skipped = dates.data.length - result.value;
  return {
    status: "done",
    message:
      result.value === 0
        ? "Nothing new: those dates are past or already have this service."
        : `Made ${result.value} ${result.value === 1 ? "service" : "services"}${
            skipped > 0 ? `. ${skipped} skipped: past, or already made` : ""
          }. Fill their positions in the Matrix.`,
  };
}
