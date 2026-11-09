"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { FormState } from "@/components/ui/action-form";
import { getAdminAccess } from "@/lib/data/admin/access";
import * as plans from "@/lib/data/plans";
import {
  eventTimesSchema,
  planErrorMessage,
  planItemsSchema,
  templateNameSchema,
  type PlanItem,
} from "@/lib/domain/plan";

// The order of service and plan templates (plan "Academy scheduling", PR 6). The database checks
// schedule.manage and that the Academy schedules; these validate input.

const id = z.uuid();
const text = (value: FormDataEntryValue | null) => (typeof value === "string" ? value : "");

function error(message: string): FormState {
  return { status: "error", message };
}
async function allowed(): Promise<boolean> {
  return (await getAdminAccess("schedule")).allowed;
}

function parseJson(value: FormDataEntryValue | null): unknown {
  try {
    return JSON.parse(text(value));
  } catch {
    return null;
  }
}

function parseItems(
  formData: FormData,
): { ok: true; items: PlanItem[] } | { ok: false; message: string } {
  const parsed = planItemsSchema.safeParse(parseJson(formData.get("items")));
  return parsed.success
    ? { ok: true, items: parsed.data }
    : { ok: false, message: parsed.error.issues[0]?.message ?? planErrorMessage("invalid_plan") };
}

export async function saveServicePlanAction(_: FormState, formData: FormData): Promise<FormState> {
  const eventId = id.safeParse(formData.get("eventId"));
  const items = parseItems(formData);
  if (!eventId.success || !(await allowed())) {
    return error(planErrorMessage("not_authorized"));
  }
  if (!items.ok) {
    return error(items.message);
  }
  const result = await plans.saveServicePlan(eventId.data, items.items);
  if (!result.ok) {
    return error(planErrorMessage(result.error));
  }
  refresh();
  return {
    status: "done",
    message: "Saved. The Service Dashboard and run sheets show it straight away.",
  };
}

export async function applyTemplateAction(_: FormState, formData: FormData): Promise<FormState> {
  const eventId = id.safeParse(formData.get("eventId"));
  const templateId = id.safeParse(formData.get("templateId"));
  if (!eventId.success || !(await allowed())) {
    return error(planErrorMessage("not_authorized"));
  }
  if (!templateId.success) {
    return error("Choose a plan template.");
  }
  const result = await plans.applyPlanTemplate(eventId.data, templateId.data);
  if (!result.ok) {
    return error(planErrorMessage(result.error));
  }
  refresh();
  return { status: "done", message: "This service now uses that plan. Change anything you like." };
}

export async function saveTimesAction(_: FormState, formData: FormData): Promise<FormState> {
  const eventId = id.safeParse(formData.get("eventId"));
  const startsAt = z.iso.datetime({ offset: true }).safeParse(formData.get("startsAt"));
  const times = eventTimesSchema.safeParse(parseJson(formData.get("times")));
  if (!eventId.success || !startsAt.success || !(await allowed())) {
    return error(planErrorMessage("not_authorized"));
  }
  if (!times.success) {
    return error(times.error.issues[0]?.message ?? planErrorMessage("invalid_times"));
  }
  const result = await plans.saveEventTimes(eventId.data, startsAt.data, times.data);
  if (!result.ok) {
    return error(planErrorMessage(result.error));
  }
  refresh();
  return { status: "done", message: "Times saved. They show in reminders and calendars." };
}

/** Saves a template: a new one when there's no templateId, such as from a service's plan. */
export async function savePlanTemplateAction(_: FormState, formData: FormData): Promise<FormState> {
  const rawId = text(formData.get("templateId"));
  const templateId = rawId === "" ? null : id.safeParse(rawId).data;
  const name = templateNameSchema.safeParse(text(formData.get("name")));
  const items = parseItems(formData);
  if (templateId === undefined || !(await allowed())) {
    return error(planErrorMessage("not_authorized"));
  }
  if (!name.success) {
    return error(name.error.issues[0]?.message ?? "Give the template a name.");
  }
  if (!items.ok) {
    return error(items.message);
  }
  const result = await plans.savePlanTemplate(templateId, name.data, items.items);
  if (!result.ok) {
    return error(planErrorMessage(result.error));
  }
  refresh();
  return {
    status: "done",
    message: templateId
      ? "Template saved. Services already planned keep their own order."
      : `Saved as "${name.data}". It's in Plan templates.`,
  };
}

export async function createTemplateAction(_: FormState, formData: FormData): Promise<FormState> {
  const name = templateNameSchema.safeParse(text(formData.get("name")));
  if (!(await allowed())) {
    return error(planErrorMessage("not_authorized"));
  }
  if (!name.success) {
    return error(name.error.issues[0]?.message ?? "Give the template a name.");
  }
  const result = await plans.savePlanTemplate(null, name.data, []);
  if (!result.ok) {
    return error(planErrorMessage(result.error));
  }
  redirect(`/admin/schedule/templates/${result.value}`);
}

export async function duplicateTemplateAction(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const templateId = id.safeParse(formData.get("templateId"));
  if (!templateId.success || !(await allowed())) {
    return error(planErrorMessage("not_authorized"));
  }
  const template = await plans.getPlanTemplate(templateId.data);
  if (!template) {
    return error(planErrorMessage("template_not_found"));
  }
  const name = `${template.name} (copy)`.slice(0, 80);
  const result = await plans.savePlanTemplate(null, name, template.items);
  if (!result.ok) {
    return error(planErrorMessage(result.error));
  }
  redirect(`/admin/schedule/templates/${result.value}`);
}

export async function archiveTemplateAction(_: FormState, formData: FormData): Promise<FormState> {
  const templateId = id.safeParse(formData.get("templateId"));
  if (!templateId.success || !(await allowed())) {
    return error(planErrorMessage("not_authorized"));
  }
  const result = await plans.archivePlanTemplate(templateId.data);
  if (!result.ok) {
    return error(planErrorMessage(result.error));
  }
  redirect("/admin/schedule/templates");
}

export async function setTypeTemplateAction(_: FormState, formData: FormData): Promise<FormState> {
  const typeId = id.safeParse(formData.get("typeId"));
  const rawTemplate = text(formData.get("templateId"));
  const templateId = rawTemplate === "" ? null : id.safeParse(rawTemplate).data;
  if (!typeId.success || templateId === undefined || !(await allowed())) {
    return error(planErrorMessage("not_authorized"));
  }
  const result = await plans.setServiceTypeTemplate(typeId.data, templateId);
  if (!result.ok) {
    return error(planErrorMessage(result.error));
  }
  refresh();
  return {
    status: "done",
    message: templateId
      ? "Services made from now on start with that plan."
      : "Services made from now on start with an empty plan.",
  };
}

export async function createServiceAction(_: FormState, formData: FormData): Promise<FormState> {
  const typeId = id.safeParse(formData.get("typeId"));
  const date = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .safeParse(formData.get("date"));
  const rawTemplate = text(formData.get("templateId"));
  const templateId = rawTemplate === "" ? null : id.safeParse(rawTemplate).data;
  if (!(await allowed())) {
    return error(planErrorMessage("not_authorized"));
  }
  if (!typeId.success) {
    return error("Choose a service type.");
  }
  if (!date.success) {
    return error("Choose a date.");
  }
  if (templateId === undefined) {
    return error("Choose a plan from the list.");
  }
  const result = await plans.createService(typeId.data, date.data, templateId);
  if (!result.ok) {
    return error(planErrorMessage(result.error));
  }
  redirect(`/admin/schedule/${result.value}`);
}
