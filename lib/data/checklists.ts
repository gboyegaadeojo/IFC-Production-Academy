import "server-only";
import { createSupabaseServerClient } from "@/lib/data/supabase/server";
import { hasCapability, type CapabilityGrant } from "@/lib/domain/capabilities";
import {
  groupServiceChecklists,
  toChecklistError,
  type ChecklistError,
  type ParsedSection,
  type ServiceChecklist,
} from "@/lib/domain/checklists";

// Pre-service checklists (decision record 9, stage 2). Row-level security and the database
// functions decide who may edit, tick, and reset.

export type ChecklistResult<T = undefined> =
  { ok: true; value: T } | { ok: false; error: ChecklistError };

function fail(error: { code?: string; message?: string }): { ok: false; error: ChecklistError } {
  return { ok: false, error: toChecklistError(error) };
}
const ok = { ok: true as const, value: undefined };

// ---------------------------------------------------------------------------
// Editing
// ---------------------------------------------------------------------------

export type ChecklistSummary = {
  id: string;
  name: string;
  departmentId: string;
  departmentName: string;
  positionNames: string[];
  items: number;
};

/** Checklists in departments this person manages checklists for. */
export async function listChecklists(
  grants: readonly CapabilityGrant[],
): Promise<ChecklistSummary[]> {
  const supabase = await createSupabaseServerClient();
  const [checklists, departments, positions, roles, items] = await Promise.all([
    supabase.from("checklists").select("id, name, department_id").is("archived_at", null),
    supabase.from("departments").select("id, name, sort_order").order("sort_order"),
    supabase.from("checklist_positions").select("checklist_id, role_id"),
    supabase.from("serving_roles").select("id, name"),
    supabase.from("checklist_items").select("checklist_id").is("archived_at", null),
  ]);
  if (checklists.error || departments.error || positions.error || roles.error || items.error) {
    throw new Error("Could not load checklists", {
      cause: (
        checklists.error ??
        departments.error ??
        positions.error ??
        roles.error ??
        items.error
      )?.code,
    });
  }
  return departments.data.flatMap((department) =>
    checklists.data
      .filter(
        (c) =>
          c.department_id === department.id &&
          hasCapability(grants, "checklist.manage", department.id),
      )
      .toSorted((a, b) => a.name.localeCompare(b.name))
      .map((c) => ({
        id: c.id,
        name: c.name,
        departmentId: department.id,
        departmentName: department.name,
        positionNames: positions.data
          .filter((p) => p.checklist_id === c.id)
          .map((p) => roles.data.find((r) => r.id === p.role_id)?.name ?? "A position")
          .toSorted(),
        items: items.data.filter((i) => i.checklist_id === c.id).length,
      })),
  );
}

export type ChecklistDetail = {
  id: string;
  name: string;
  departmentId: string;
  departmentName: string;
  positionIds: string[];
  sections: {
    id: string;
    name: string;
    sortOrder: number;
    items: { id: string; text: string; sortOrder: number }[];
  }[];
};

export async function getChecklist(id: string): Promise<ChecklistDetail | null> {
  const supabase = await createSupabaseServerClient();
  const checklist = await supabase
    .from("checklists")
    .select("id, name, department_id")
    .eq("id", id)
    .is("archived_at", null)
    .maybeSingle();
  if (checklist.error) {
    throw new Error("Could not load the checklist", { cause: checklist.error.code });
  }
  if (!checklist.data) {
    return null;
  }
  const [department, positions, sections, items] = await Promise.all([
    supabase.from("departments").select("name").eq("id", checklist.data.department_id).single(),
    supabase.from("checklist_positions").select("role_id").eq("checklist_id", id),
    supabase
      .from("checklist_sections")
      .select("id, name, sort_order")
      .eq("checklist_id", id)
      .is("archived_at", null)
      .order("sort_order"),
    supabase
      .from("checklist_items")
      .select("id, section_id, text, sort_order")
      .eq("checklist_id", id)
      .is("archived_at", null)
      .order("sort_order"),
  ]);
  if (department.error || positions.error || sections.error || items.error) {
    throw new Error("Could not load the checklist", {
      cause: (department.error ?? positions.error ?? sections.error ?? items.error)?.code,
    });
  }
  return {
    id: checklist.data.id,
    name: checklist.data.name,
    departmentId: checklist.data.department_id,
    departmentName: department.data.name,
    positionIds: positions.data.map((p) => p.role_id),
    sections: sections.data.map((section) => ({
      id: section.id,
      name: section.name,
      sortOrder: section.sort_order,
      items: items.data
        .filter((item) => item.section_id === section.id)
        .map((item) => ({ id: item.id, text: item.text, sortOrder: item.sort_order })),
    })),
  };
}

/** Positions in a department, for linking a checklist to the people who use it. */
export async function getDepartmentPositions(
  departmentId: string,
): Promise<{ id: string; name: string; leadsService: boolean }[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("serving_roles")
    .select("id, name, leads_service")
    .eq("department_id", departmentId)
    .is("archived_at", null)
    .order("name");
  if (error) {
    throw new Error("Could not load positions", { cause: error.code });
  }
  return data.map((r) => ({ id: r.id, name: r.name, leadsService: r.leads_service }));
}

export async function createChecklist(
  departmentId: string,
  name: string,
): Promise<ChecklistResult<string>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("checklists")
    .insert({ department_id: departmentId, name })
    .select("id")
    .single();
  return error ? fail(error) : { ok: true, value: data.id };
}

export async function renameChecklist(id: string, name: string): Promise<ChecklistResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("checklists").update({ name }).eq("id", id);
  return error ? fail(error) : ok;
}

export async function archiveChecklist(id: string): Promise<ChecklistResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("checklists")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id);
  return error ? fail(error) : ok;
}

export async function setChecklistPositions(
  id: string,
  roleIds: string[],
): Promise<ChecklistResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_checklist_positions", {
    p_checklist_id: id,
    p_role_ids: roleIds,
  });
  return error ? fail(error) : ok;
}

async function nextSectionOrder(checklistId: string): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("checklist_sections")
    .select("sort_order")
    .eq("checklist_id", checklistId)
    .order("sort_order", { ascending: false })
    .limit(1);
  return (data?.[0]?.sort_order ?? 0) + 10;
}

async function nextItemOrder(sectionId: string): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("checklist_items")
    .select("sort_order")
    .eq("section_id", sectionId)
    .order("sort_order", { ascending: false })
    .limit(1);
  return (data?.[0]?.sort_order ?? 0) + 10;
}

export async function addSection(checklistId: string, name: string): Promise<ChecklistResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("checklist_sections").insert({
    checklist_id: checklistId,
    name,
    sort_order: await nextSectionOrder(checklistId),
  });
  return error ? fail(error) : ok;
}

export async function updateSection(
  id: string,
  change: { name?: string; archived?: boolean },
): Promise<ChecklistResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("checklist_sections")
    .update({
      ...(change.name ? { name: change.name } : {}),
      ...(change.archived ? { archived_at: new Date().toISOString() } : {}),
    })
    .eq("id", id);
  return error ? fail(error) : ok;
}

export async function addItem(sectionId: string, text: string): Promise<ChecklistResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("checklist_items").insert({
    section_id: sectionId,
    text,
    sort_order: await nextItemOrder(sectionId),
  });
  return error ? fail(error) : ok;
}

export async function updateItem(
  id: string,
  change: { text?: string; archived?: boolean },
): Promise<ChecklistResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("checklist_items")
    .update({
      ...(change.text ? { text: change.text } : {}),
      ...(change.archived ? { archived_at: new Date().toISOString() } : {}),
    })
    .eq("id", id);
  return error ? fail(error) : ok;
}

/** Swaps the order of two sections or two items, for moving one up or down. */
export async function swapOrder(
  table: "checklist_sections" | "checklist_items",
  a: { id: string; sortOrder: number },
  b: { id: string; sortOrder: number },
): Promise<ChecklistResult> {
  const supabase = await createSupabaseServerClient();
  const first = await supabase.from(table).update({ sort_order: b.sortOrder }).eq("id", a.id);
  if (first.error) {
    return fail(first.error);
  }
  const second = await supabase.from(table).update({ sort_order: a.sortOrder }).eq("id", b.id);
  return second.error ? fail(second.error) : ok;
}

/** Adds pasted sections and items after what's there. */
export async function importSections(
  checklistId: string,
  sections: readonly ParsedSection[],
): Promise<ChecklistResult<number>> {
  const supabase = await createSupabaseServerClient();
  let order = await nextSectionOrder(checklistId);
  let added = 0;
  for (const section of sections) {
    const created = await supabase
      .from("checklist_sections")
      .insert({ checklist_id: checklistId, name: section.name, sort_order: order })
      .select("id")
      .single();
    if (created.error) {
      return fail(created.error);
    }
    order += 10;
    const items = await supabase.from("checklist_items").insert(
      section.items.map((text, index) => ({
        section_id: created.data.id,
        text,
        sort_order: (index + 1) * 10,
      })),
    );
    if (items.error) {
      return fail(items.error);
    }
    added += section.items.length;
  }
  return { ok: true, value: added };
}

export async function setSeesAll(roleId: string, seesAll: boolean): Promise<ChecklistResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_role_sees_all", {
    p_role_id: roleId,
    p_sees_all: seesAll,
  });
  return error ? fail(error) : ok;
}

export async function setLeadsService(roleId: string, leads: boolean): Promise<ChecklistResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_role_leads_service", {
    p_role_id: roleId,
    p_leads: leads,
  });
  return error ? fail(error) : ok;
}

// ---------------------------------------------------------------------------
// Service day
// ---------------------------------------------------------------------------

export type ServiceChecklistState = {
  canLead: boolean;
  canTick: boolean;
  open: boolean;
  undoAvailable: boolean;
  isScheduled: boolean;
  /** Sees every department by default ("Sees all departments" position). */
  seesAll: boolean;
};

/** A service's checklists and what this person may do, or null if they can't see them. */
export async function getServiceChecklists(
  eventId: string,
): Promise<{ checklists: ServiceChecklist[]; state: ServiceChecklistState } | null> {
  const supabase = await createSupabaseServerClient();
  const [rows, state] = await Promise.all([
    supabase.rpc("event_checklists", { p_event_id: eventId }),
    supabase.rpc("service_checklist_state", { p_event_id: eventId }),
  ]);
  if (rows.error?.code === "42501" || state.error?.code === "42501") {
    return null;
  }
  if (rows.error || state.error) {
    throw new Error("Could not load the checklists", {
      cause: (rows.error ?? state.error)?.code,
    });
  }
  const flags = state.data[0];
  return {
    checklists: groupServiceChecklists(
      rows.data.map((row) => ({
        checklistId: row.checklist_id,
        checklistName: row.checklist_name,
        departmentName: row.department_name,
        isMine: row.is_mine,
        sectionId: row.section_id,
        sectionName: row.section_name,
        itemId: row.item_id,
        itemText: row.item_text,
        checkedByName: row.checked_by_name,
        checkedAt: row.checked_at,
      })),
    ),
    state: {
      canLead: flags?.can_lead ?? false,
      canTick: flags?.can_tick ?? false,
      open: flags?.open ?? false,
      undoAvailable: flags?.undo_available ?? false,
      isScheduled: flags?.is_scheduled ?? false,
      seesAll: flags?.sees_all ?? false,
    },
  };
}

/**
 * Ticks or unticks an item. Every attempt, allowed or refused, is written to the activity log
 * with the browser tab it came from (checklist app US-07a).
 */
export async function setChecklistItem(
  eventId: string,
  itemId: string,
  checked: boolean,
  tabId: string | null,
): Promise<ChecklistResult> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("checklist_tick", {
    p_event_id: eventId,
    p_item_id: itemId,
    p_checked: checked,
    p_tab_id: tabId,
  });
  if (error) {
    return fail(error);
  }
  return data === "ok" ? ok : fail({ message: data });
}

type Counted = { ok?: boolean; count?: number; reason?: string };

function counted(data: unknown): ChecklistResult<number> {
  const result = (data ?? {}) as Counted;
  return result.ok
    ? { ok: true, value: Number(result.count ?? 0) }
    : fail({ message: result.reason ?? "unknown" });
}

export async function resetServiceChecklists(
  eventId: string,
  tabId: string | null,
): Promise<ChecklistResult<number>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("checklist_reset", {
    p_event_id: eventId,
    p_tab_id: tabId,
  });
  return error ? fail(error) : counted(data);
}

export async function undoChecklistReset(
  eventId: string,
  tabId: string | null,
): Promise<ChecklistResult<number>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("checklist_undo_reset", {
    p_event_id: eventId,
    p_tab_id: tabId,
  });
  return error ? fail(error) : counted(data);
}

export type ServiceHeader = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  location: string;
  cancelled: boolean;
};

/** The service itself: services aren't private, so any active user may read them. */
export async function getServiceHeader(eventId: string): Promise<ServiceHeader | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("events")
    .select("id, title, starts_at, ends_at, location, cancelled_at")
    .eq("id", eventId)
    .maybeSingle();
  if (error) {
    throw new Error("Could not load the service", { cause: error.code });
  }
  return data
    ? {
        id: data.id,
        title: data.title,
        startsAt: data.starts_at,
        endsAt: data.ends_at,
        location: data.location,
        cancelled: data.cancelled_at !== null,
      }
    : null;
}

/** Today's service, or the next one: what the checklist opens to (checklist app US-07). */
export async function getCurrentServiceId(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("current_service");
  if (error) {
    throw new Error("Could not find the current service", { cause: error.code });
  }
  return data;
}

export type ActivityEntry = {
  id: string;
  happenedAt: string;
  kind: "checkoff" | "edit";
  action: string;
  outcome: "ok" | "unchanged" | "refused";
  reason: string | null;
  subject: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  actorName: string;
  sessionId: string | null;
  tabId: string | null;
};

/**
 * The activity log, newest first: one service's check-offs, checklist edits, or both
 * (checklist app US-07a, US-13b). Row-level security limits it to checklist managers.
 */
export async function getChecklistActivity(input: {
  eventId: string | null;
  kind: "all" | "checkoff" | "edit";
  limit?: number;
}): Promise<ActivityEntry[]> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("checklist_log")
    .select(
      "id, happened_at, kind, action, outcome, reason, subject, before, after, actor_name, session_id, tab_id, event_id",
    )
    .order("happened_at", { ascending: false })
    .limit(input.limit ?? 300);
  if (input.kind === "checkoff") {
    query = query.eq("kind", "checkoff");
  } else if (input.kind === "edit") {
    query = query.eq("kind", "edit");
  }
  if (input.kind !== "edit" && input.eventId) {
    // Check-offs for the chosen service, plus every edit.
    query =
      input.kind === "checkoff"
        ? query.eq("event_id", input.eventId)
        : query.or(`event_id.eq.${input.eventId},kind.eq.edit`);
  }
  const { data, error } = await query;
  if (error) {
    throw new Error("Could not load the activity log", { cause: error.code });
  }
  return data.map((row) => ({
    id: row.id,
    happenedAt: row.happened_at,
    kind: row.kind === "edit" ? "edit" : "checkoff",
    action: row.action,
    outcome:
      row.outcome === "refused" ? "refused" : row.outcome === "unchanged" ? "unchanged" : "ok",
    reason: row.reason,
    subject: row.subject,
    before: (row.before as Record<string, unknown> | null) ?? null,
    after: (row.after as Record<string, unknown> | null) ?? null,
    actorName: row.actor_name,
    sessionId: row.session_id,
    tabId: row.tab_id,
  }));
}

/** Recent services, for choosing whose check-offs to show. */
export async function getRecentServices(
  limit = 20,
): Promise<{ id: string; title: string; startsAt: string }[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("events")
    .select("id, title, starts_at")
    .is("cancelled_at", null)
    .lte("starts_at", new Date(Date.now() + 7 * 86_400_000).toISOString())
    .order("starts_at", { ascending: false })
    .limit(limit);
  if (error) {
    throw new Error("Could not load services", { cause: error.code });
  }
  return data.map((row) => ({ id: row.id, title: row.title, startsAt: row.starts_at }));
}
