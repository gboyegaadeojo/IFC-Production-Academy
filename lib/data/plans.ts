import "server-only";
import { createSupabaseServerClient } from "@/lib/data/supabase/server";
import {
  EVENT_TIME_KINDS,
  itemsFromTemplate,
  PLAN_ITEM_KINDS,
  planPayload,
  timesPayload,
  toPlanError,
  type EventTime,
  type EventTimeKind,
  type PlanError,
  type PlanItem,
  type PlanItemKind,
  type PlanNote,
} from "@/lib/domain/plan";
import { utcToWinnipeg } from "@/lib/domain/schedule";

// The order of service and plan templates (plan "Academy scheduling", PR 6). The database checks
// schedule.manage and that the Academy schedules; these only read and pass values on.

type Result<T = undefined> = { ok: true; value: T } | { ok: false; error: PlanError };

const done = <T>(value: T): Result<T> => ({ ok: true, value });
const failed = (error: { code?: string; message?: string }): Result<never> => ({
  ok: false,
  error: toPlanError(error),
});

export type PlanTemplate = { id: string; name: string; items: PlanItem[] };

export type ServicePlan = {
  items: PlanItem[];
  times: EventTime[];
};

const asKind = (value: string): PlanItemKind =>
  (PLAN_ITEM_KINDS as readonly string[]).includes(value) ? (value as PlanItemKind) : "item";

function asNotes(value: unknown): PlanNote[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((note: unknown) => {
    if (typeof note !== "object" || note === null) {
      return [];
    }
    const { category, content } = note as { category?: unknown; content?: unknown };
    return typeof category === "string" && typeof content === "string"
      ? [{ category, content }]
      : [];
  });
}

/** A service's order of service and extra times, with times as Winnipeg "HH:MM". */
export async function getServicePlan(eventId: string): Promise<ServicePlan> {
  const supabase = await createSupabaseServerClient();
  const [items, times] = await Promise.all([
    supabase
      .from("service_plan_items")
      .select("external_id, position, item_type, title, length_seconds, notes")
      .eq("event_id", eventId)
      .order("position"),
    supabase
      .from("event_times")
      .select("kind, label, starts_at, ends_at")
      .eq("event_id", eventId)
      .order("starts_at"),
  ]);
  if (items.error || times.error) {
    throw new Error("Could not load the order of service", {
      cause: (items.error ?? times.error)?.code,
    });
  }
  return {
    items: items.data.map((row) => ({
      id: row.external_id,
      kind: asKind(row.item_type),
      title: row.title,
      lengthSeconds: row.length_seconds,
      notes: asNotes(row.notes),
    })),
    times: times.data.map((row) => ({
      kind: (EVENT_TIME_KINDS as readonly string[]).includes(row.kind)
        ? (row.kind as EventTimeKind)
        : "other",
      label: row.label,
      start: utcToWinnipeg(row.starts_at)[1],
      end: utcToWinnipeg(row.ends_at)[1],
    })),
  };
}

export async function saveServicePlan(eventId: string, items: PlanItem[]): Promise<Result> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("save_service_plan", {
    p_event_id: eventId,
    p_items: planPayload(items),
  });
  return error ? failed(error) : done(undefined);
}

export async function saveEventTimes(
  eventId: string,
  serviceStartsAt: string,
  times: EventTime[],
): Promise<Result> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("save_event_times", {
    p_event_id: eventId,
    p_times: timesPayload(serviceStartsAt, times),
  });
  return error ? failed(error) : done(undefined);
}

export async function applyPlanTemplate(eventId: string, templateId: string): Promise<Result> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("apply_plan_template", {
    p_event_id: eventId,
    p_template_id: templateId,
  });
  return error ? failed(error) : done(undefined);
}

export async function listPlanTemplates(): Promise<PlanTemplate[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("plan_templates")
    .select("id, name, items")
    .is("archived_at", null)
    .order("name");
  if (error) {
    throw new Error("Could not load plan templates", { cause: error.code });
  }
  return data.map((row) => ({ id: row.id, name: row.name, items: itemsFromTemplate(row.items) }));
}

export async function getPlanTemplate(id: string): Promise<PlanTemplate | null> {
  return (await listPlanTemplates()).find((template) => template.id === id) ?? null;
}

export async function savePlanTemplate(
  id: string | null,
  name: string,
  items: PlanItem[],
): Promise<Result<string>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("save_plan_template", {
    p_id: id,
    p_name: name,
    p_items: planPayload(items),
  });
  return error ? failed(error) : done(data);
}

export async function archivePlanTemplate(id: string): Promise<Result> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("archive_plan_template", { p_id: id });
  return error ? failed(error) : done(undefined);
}

export async function setServiceTypeTemplate(
  typeId: string,
  templateId: string | null,
): Promise<Result> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_service_type_template", {
    p_type_id: typeId,
    p_template_id: templateId,
  });
  return error ? failed(error) : done(undefined);
}

/** One service of a type on a Winnipeg day, with a chosen plan. Returns the service's id. */
export async function createService(
  typeId: string,
  date: string,
  templateId: string | null,
): Promise<Result<string>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("create_service", {
    p_type_id: typeId,
    p_date: date,
    p_template_id: templateId,
  });
  return error ? failed(error) : done(data);
}

/** Headings for department notes: the production departments, in their order. */
export async function getNoteHeadings(): Promise<string[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("departments")
    .select("name, sort_order")
    .eq("kind", "team")
    .order("sort_order");
  if (error) {
    throw new Error("Could not load departments", { cause: error.code });
  }
  return data.map((row) => row.name);
}
