import "server-only";
import { createSupabaseServerClient } from "@/lib/data/supabase/server";
import { hasCapability, type CapabilityGrant } from "@/lib/domain/capabilities";
import type { StepKind, StepPlacement } from "@/lib/domain/onboarding";

// Onboarding pathways (docs/decisions/2026-11-01-onboarding-pathways.md). Row-level security
// limits every read to pathways the person looks after; the database functions move people on.

export type OnboardingResult = { ok: true } | { ok: false; error: string };

function result(error: { code?: string; message?: string } | null): OnboardingResult {
  if (!error) {
    return { ok: true };
  }
  const known = [
    "not_authorized",
    "already_taken",
    "already_in_pathway",
    "not_in_pool",
    "completes_from_planning_center",
    "invalid_person",
    "invalid_interest",
  ];
  if (error.message && known.includes(error.message)) {
    return { ok: false, error: error.message };
  }
  return { ok: false, error: error.code === "42501" ? "not_authorized" : "unknown" };
}

export type PathwaySummary = {
  id: string;
  name: string;
  departmentId: string | null;
  departmentName: string | null;
  hue: string;
  icon: string;
  stepCount: number;
  activeCount: number;
};

export type Choice = { id: string; name: string };

/** The pathways someone looks after, and the ones they could set up. */
export async function getPathways(grants: readonly CapabilityGrant[]): Promise<{
  pathways: PathwaySummary[];
  canCreateGeneral: boolean;
  departmentsWithout: (Choice & { hue: string; icon: string })[];
}> {
  const supabase = await createSupabaseServerClient();
  const [pathways, departments, steps, entries] = await Promise.all([
    supabase
      .from("onboarding_pathways")
      .select("id, name, department_id")
      .is("archived_at", null)
      .order("created_at"),
    supabase
      .from("departments")
      .select("id, name, hue, icon, status, sort_order")
      .neq("status", "inactive")
      .order("sort_order"),
    supabase.from("onboarding_steps").select("pathway_id").is("archived_at", null),
    supabase.from("onboarding_entries").select("pathway_id").eq("status", "active"),
  ]);
  for (const r of [pathways, departments, steps, entries]) {
    if (r.error) {
      throw new Error("Could not load onboarding", { cause: r.error.code });
    }
  }
  const dept = new Map((departments.data ?? []).map((d) => [d.id, d]));
  const count = (rows: { pathway_id: string }[] | null, id: string) =>
    (rows ?? []).filter((r) => r.pathway_id === id).length;
  const list = (pathways.data ?? [])
    .map((p) => ({
      id: p.id,
      name: p.name,
      departmentId: p.department_id,
      departmentName: p.department_id ? (dept.get(p.department_id)?.name ?? null) : null,
      hue: p.department_id ? (dept.get(p.department_id)?.hue ?? "") : "",
      icon: p.department_id ? (dept.get(p.department_id)?.icon ?? "") : "",
      stepCount: count(steps.data, p.id),
      activeCount: count(entries.data, p.id),
    }))
    .toSorted((a, b) => (a.departmentId === null ? -1 : b.departmentId === null ? 1 : 0));
  const taken = new Set(list.map((p) => p.departmentId));
  return {
    pathways: list,
    canCreateGeneral: !taken.has(null) && hasCapability(grants, "onboarding.manage"),
    departmentsWithout: (departments.data ?? [])
      .filter(
        (d) =>
          d.status === "active" &&
          !taken.has(d.id) &&
          hasCapability(grants, "onboarding.manage", d.id),
      )
      .map((d) => ({ id: d.id, name: d.name, hue: d.hue, icon: d.icon })),
  };
}

export type EditorStep = {
  id: string;
  stageId: string;
  kind: StepKind;
  title: string;
  config: Record<string, unknown>;
};
export type EditorStage = {
  id: string;
  name: string;
  timing: string;
  steps: EditorStep[];
  peopleHere: number;
};
export type PathwayEditor = {
  id: string;
  name: string;
  summary: string;
  departmentId: string | null;
  stages: EditorStage[];
  /** Names for summaries and the step settings. */
  roles: Choice[];
  people: Choice[];
  courses: Choice[];
  servingRoles: Choice[];
};

/** One pathway with its stages and steps in order, and the choices its settings need. */
export async function getPathwayEditor(pathwayId: string): Promise<PathwayEditor | null> {
  const supabase = await createSupabaseServerClient();
  const pathway = await supabase
    .from("onboarding_pathways")
    .select("id, name, summary, department_id")
    .eq("id", pathwayId)
    .is("archived_at", null)
    .maybeSingle();
  if (pathway.error) {
    throw new Error("Could not load the pathway", { cause: pathway.error.code });
  }
  if (!pathway.data) {
    return null;
  }
  const departmentId = pathway.data.department_id;
  const [stages, steps, entries, roles, courses, versions, servingRoles, people] =
    await Promise.all([
      supabase
        .from("onboarding_stages")
        .select("id, name, timing, sort_order, created_at")
        .eq("pathway_id", pathwayId)
        .is("archived_at", null)
        .order("sort_order")
        .order("created_at"),
      supabase
        .from("onboarding_steps")
        .select("id, stage_id, kind, title, config, sort_order, created_at")
        .eq("pathway_id", pathwayId)
        .is("archived_at", null)
        .order("sort_order")
        .order("created_at"),
      supabase
        .from("onboarding_entries")
        .select("current_step_id")
        .eq("pathway_id", pathwayId)
        .eq("status", "active"),
      supabase.from("roles").select("id, name").order("name"),
      supabase.from("courses").select("id, department_id").is("archived_at", null),
      supabase.from("course_versions").select("course_id, title").eq("status", "published"),
      departmentId
        ? supabase
            .from("serving_roles")
            .select("id, name")
            .eq("department_id", departmentId)
            .is("archived_at", null)
            .order("name")
        : supabase.from("serving_roles").select("id, name").is("archived_at", null).order("name"),
      supabase.rpc("onboarding_leaders", { p_pathway_id: pathwayId }),
    ]);
  for (const r of [stages, steps, entries, roles, courses, versions, servingRoles]) {
    if (r.error) {
      throw new Error("Could not load the pathway", { cause: r.error.code });
    }
  }
  const stepStage = new Map((steps.data ?? []).map((s) => [s.id, s.stage_id]));
  const here = (stageId: string) =>
    (entries.data ?? []).filter(
      (e) => e.current_step_id && stepStage.get(e.current_step_id) === stageId,
    ).length;
  const courseTitle = new Map((versions.data ?? []).map((v) => [v.course_id, v.title]));
  return {
    id: pathway.data.id,
    name: pathway.data.name,
    summary: pathway.data.summary,
    departmentId,
    stages: (stages.data ?? []).map((stage) => ({
      id: stage.id,
      name: stage.name,
      timing: stage.timing,
      peopleHere: here(stage.id),
      steps: (steps.data ?? [])
        .filter((s) => s.stage_id === stage.id)
        .map((s) => ({
          id: s.id,
          stageId: s.stage_id,
          kind: s.kind,
          title: s.title,
          config: (s.config ?? {}) as Record<string, unknown>,
        })),
    })),
    roles: (roles.data ?? []).map((r) => ({ id: r.id, name: r.name })),
    people: people.error
      ? []
      : (people.data ?? []).map((p) => ({ id: p.user_id, name: p.display_name })),
    courses: (courses.data ?? [])
      .filter((c) => courseTitle.has(c.id))
      .map((c) => ({ id: c.id, name: courseTitle.get(c.id) ?? "" }))
      .toSorted((a, b) => a.name.localeCompare(b.name)),
    servingRoles: (servingRoles.data ?? []).map((r) => ({ id: r.id, name: r.name })),
  };
}

// ---------------------------------------------------------------------------
// Building
// ---------------------------------------------------------------------------

/** A new pathway with a sensible start: one stage holding its way in. */
export async function createPathway(input: {
  organizationId: string;
  departmentId: string | null;
  name: string;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("onboarding_pathways")
    .insert({
      organization_id: input.organizationId,
      department_id: input.departmentId,
      name: input.name,
    })
    .select("id")
    .single();
  if (error) {
    return result(error) as { ok: false; error: string };
  }
  const stage = await supabase
    .from("onboarding_stages")
    .insert({ pathway_id: data.id, name: "Welcome", timing: "Day 0", sort_order: 10 })
    .select("id")
    .single();
  if (!stage.error) {
    await supabase.from("onboarding_steps").insert({
      pathway_id: data.id,
      stage_id: stage.data.id,
      kind: input.departmentId ? "trigger_join" : "trigger_form",
      title: input.departmentId ? "Joins the department" : "“I want to serve” page",
      sort_order: 10,
    });
  }
  return { ok: true, id: data.id };
}

export async function updatePathway(
  id: string,
  name: string,
  summary: string,
): Promise<OnboardingResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("onboarding_pathways")
    .update({ name, summary })
    .eq("id", id);
  return result(error);
}

export async function addStage(
  pathwayId: string,
  name: string,
  timing: string,
): Promise<OnboardingResult> {
  const supabase = await createSupabaseServerClient();
  const last = await supabase
    .from("onboarding_stages")
    .select("sort_order")
    .eq("pathway_id", pathwayId)
    .is("archived_at", null)
    .order("sort_order", { ascending: false })
    .limit(1);
  const sortOrder = (last.data?.[0]?.sort_order ?? 0) + 10;
  const { error } = await supabase
    .from("onboarding_stages")
    .insert({ pathway_id: pathwayId, name, timing, sort_order: sortOrder });
  return result(error);
}

export async function updateStage(
  id: string,
  name: string,
  timing: string,
): Promise<OnboardingResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("onboarding_stages").update({ name, timing }).eq("id", id);
  return result(error);
}

/** Stages swap places with their neighbour. */
export async function moveStage(
  pathwayId: string,
  id: string,
  direction: "up" | "down",
): Promise<OnboardingResult> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("onboarding_stages")
    .select("id, sort_order")
    .eq("pathway_id", pathwayId)
    .is("archived_at", null)
    .order("sort_order")
    .order("created_at");
  if (error) {
    return result(error);
  }
  const i = data.findIndex((s) => s.id === id);
  const j = direction === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= data.length) {
    return { ok: true };
  }
  const order = data.map((s) => s.id);
  [order[i], order[j]] = [order[j]!, order[i]!];
  for (const [n, stageId] of order.entries()) {
    const update = await supabase
      .from("onboarding_stages")
      .update({ sort_order: (n + 1) * 10 })
      .eq("id", stageId);
    if (update.error) {
      return result(update.error);
    }
  }
  return { ok: true };
}

/** Removes an empty stage. A stage with steps keeps them; move or remove those first. */
export async function removeStage(id: string): Promise<OnboardingResult> {
  const supabase = await createSupabaseServerClient();
  const steps = await supabase
    .from("onboarding_steps")
    .select("id", { count: "exact", head: true })
    .eq("stage_id", id)
    .is("archived_at", null);
  if ((steps.count ?? 0) > 0) {
    return { ok: false, error: "stage_not_empty" };
  }
  const { error } = await supabase
    .from("onboarding_stages")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id);
  return result(error);
}

export async function addStep(input: {
  pathwayId: string;
  stageId: string;
  kind: StepKind;
  title: string;
  config: Record<string, unknown>;
  afterStepId: string | null;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const siblings = await supabase
    .from("onboarding_steps")
    .select("id, sort_order")
    .eq("stage_id", input.stageId)
    .is("archived_at", null)
    .order("sort_order")
    .order("created_at");
  if (siblings.error) {
    return result(siblings.error) as { ok: false; error: string };
  }
  const order = siblings.data.map((s) => s.id);
  const at = input.afterStepId ? order.indexOf(input.afterStepId) + 1 : order.length;
  const { data, error } = await supabase
    .from("onboarding_steps")
    .insert({
      pathway_id: input.pathwayId,
      stage_id: input.stageId,
      kind: input.kind,
      title: input.title,
      config: input.config as never,
      sort_order: (at + 1) * 10 - 5,
    })
    .select("id")
    .single();
  if (error) {
    return result(error) as { ok: false; error: string };
  }
  order.splice(at, 0, data.id);
  await placeSteps(order.map((id, n) => ({ id, stageId: input.stageId, sortOrder: (n + 1) * 10 })));
  return { ok: true, id: data.id };
}

export async function updateStep(
  id: string,
  title: string,
  config: Record<string, unknown>,
): Promise<OnboardingResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("onboarding_steps")
    .update({ title, config: config as never })
    .eq("id", id);
  return result(error);
}

/** Removing a step archives it, so anyone's history that mentions it stays readable. */
export async function removeStep(id: string): Promise<OnboardingResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("onboarding_steps")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id);
  return result(error);
}

/** Saves new places for steps, from a move or a drop (lib/domain/onboarding planStep*). */
export async function placeSteps(placements: readonly StepPlacement[]): Promise<OnboardingResult> {
  const supabase = await createSupabaseServerClient();
  for (const p of placements) {
    const { error } = await supabase
      .from("onboarding_steps")
      .update({ stage_id: p.stageId, sort_order: p.sortOrder })
      .eq("id", p.id);
    if (error) {
      return result(error);
    }
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Running
// ---------------------------------------------------------------------------

export async function addPerson(
  pathwayId: string,
  name: string,
  email: string,
): Promise<OnboardingResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("onboarding_add_person", {
    p_pathway_id: pathwayId,
    p_name: name,
    p_email: email,
  });
  return result(error);
}

export async function completeTask(taskId: string): Promise<OnboardingResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("onboarding_complete_task", { p_task_id: taskId });
  return result(error);
}

export async function claimTask(taskId: string): Promise<OnboardingResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("onboarding_claim_task", { p_task_id: taskId });
  return result(error);
}

export async function assignTask(taskId: string, userId: string): Promise<OnboardingResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("onboarding_assign_task", {
    p_task_id: taskId,
    p_user_id: userId,
  });
  return result(error);
}

export async function stopEntry(entryId: string): Promise<OnboardingResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("onboarding_stop", { p_entry_id: entryId });
  return result(error);
}

export async function addNote(
  entryId: string,
  body: string,
  visibility: "shared" | "private",
): Promise<OnboardingResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("onboarding_notes")
    .insert({ entry_id: entryId, body, visibility });
  return result(error);
}

export type PersonInPathway = {
  entryId: string;
  name: string;
  email: string;
  pathwayId: string;
  pathwayName: string;
  stepTitle: string | null;
  stepKind: StepKind | null;
  stepStartedAt: string;
  cameInBy: string;
  status: "active" | "finished" | "stopped";
  position: number;
  total: number;
};

/** Everyone in the pathways someone looks after, newest first. */
export async function getPeopleInPathways(): Promise<PersonInPathway[]> {
  const supabase = await createSupabaseServerClient();
  const [entries, contacts, pathways, steps] = await Promise.all([
    supabase
      .from("onboarding_entries")
      .select(
        "id, pathway_id, contact_id, current_step_id, status, came_in_by, step_started_at, started_at",
      )
      .order("started_at", { ascending: false })
      .limit(300),
    supabase.from("onboarding_contacts").select("id, display_name, email"),
    supabase.from("onboarding_pathways").select("id, name"),
    supabase
      .from("onboarding_steps")
      .select("id, pathway_id, stage_id, kind, title, sort_order, archived_at"),
  ]);
  for (const r of [entries, contacts, pathways, steps]) {
    if (r.error) {
      throw new Error("Could not load people in onboarding", { cause: r.error.code });
    }
  }
  const contact = new Map((contacts.data ?? []).map((c) => [c.id, c]));
  const pathway = new Map((pathways.data ?? []).map((p) => [p.id, p.name]));
  const step = new Map((steps.data ?? []).map((s) => [s.id, s]));
  const liveSteps = (pathwayId: string) =>
    (steps.data ?? []).filter(
      (s) => s.pathway_id === pathwayId && !s.archived_at && !s.kind.startsWith("trigger_"),
    );
  return (entries.data ?? []).map((e) => {
    const current = e.current_step_id ? step.get(e.current_step_id) : undefined;
    const live = liveSteps(e.pathway_id);
    const index = current ? live.findIndex((s) => s.id === current.id) : -1;
    return {
      entryId: e.id,
      name: contact.get(e.contact_id)?.display_name ?? "Someone",
      email: contact.get(e.contact_id)?.email ?? "",
      pathwayId: e.pathway_id,
      pathwayName: pathway.get(e.pathway_id) ?? "",
      stepTitle: current?.title ?? null,
      stepKind: (current?.kind as StepKind | undefined) ?? null,
      stepStartedAt: e.step_started_at,
      cameInBy: e.came_in_by,
      status: e.status,
      position: e.status === "finished" ? live.length : Math.max(0, index),
      total: live.length,
    };
  });
}

export type EntryDetail = {
  events: { id: string; kind: string; detail: string; at: string; actor: string | null }[];
  notes: {
    id: string;
    body: string;
    visibility: "shared" | "private";
    at: string;
    author: string;
  }[];
};

export async function getEntryDetail(entryId: string): Promise<EntryDetail> {
  const supabase = await createSupabaseServerClient();
  const [events, notes] = await Promise.all([
    supabase
      .from("onboarding_events")
      .select("id, kind, detail, created_at, actor_id")
      .eq("entry_id", entryId)
      .order("created_at"),
    supabase
      .from("onboarding_notes")
      .select("id, body, visibility, created_at, author_id")
      .eq("entry_id", entryId)
      .order("created_at", { ascending: false }),
  ]);
  if (events.error || notes.error) {
    throw new Error("Could not load their history", { cause: (events.error ?? notes.error)?.code });
  }
  const ids = [
    ...new Set(
      [
        ...(events.data ?? []).map((e) => e.actor_id),
        ...(notes.data ?? []).map((n) => n.author_id),
      ].filter((id): id is string => Boolean(id)),
    ),
  ];
  const names = ids.length
    ? await supabase.from("profiles").select("id, display_name").in("id", ids)
    : { data: [] as { id: string; display_name: string }[] };
  const name = new Map((names.data ?? []).map((p) => [p.id, p.display_name]));
  return {
    events: (events.data ?? []).map((e) => ({
      id: e.id,
      kind: e.kind,
      detail: e.detail,
      at: e.created_at,
      actor: e.actor_id ? (name.get(e.actor_id) ?? null) : null,
    })),
    notes: (notes.data ?? []).map((n) => ({
      id: n.id,
      body: n.body,
      visibility: n.visibility === "private" ? "private" : "shared",
      at: n.created_at,
      author: name.get(n.author_id) ?? "A leader",
    })),
  };
}

export type FollowUp = {
  id: string;
  entryId: string;
  title: string;
  detail: string;
  kind: string;
  personName: string;
  pathwayName: string;
  assigneeId: string | null;
  assigneeName: string | null;
  dueAt: string | null;
  doneAt: string | null;
  pool: Choice[];
};

/** Open follow-ups someone can see: theirs, unclaimed ones, and the rest of their pathways'. */
export async function getFollowUps(): Promise<FollowUp[]> {
  const supabase = await createSupabaseServerClient();
  const tasks = await supabase
    .from("onboarding_tasks")
    .select("id, entry_id, title, detail, kind, assignee_id, due_at, done_at")
    .is("done_at", null)
    .order("due_at");
  if (tasks.error) {
    throw new Error("Could not load follow-ups", { cause: tasks.error.code });
  }
  const entryIds = [...new Set(tasks.data.map((t) => t.entry_id))];
  if (entryIds.length === 0) {
    return [];
  }
  const [entries, pools] = await Promise.all([
    supabase.from("onboarding_entries").select("id, contact_id, pathway_id").in("id", entryIds),
    supabase.rpc("onboarding_task_pools", { p_task_ids: tasks.data.map((t) => t.id) }),
  ]);
  if (entries.error) {
    throw new Error("Could not load follow-ups", { cause: entries.error.code });
  }
  const [contacts, pathways] = await Promise.all([
    supabase
      .from("onboarding_contacts")
      .select("id, display_name")
      .in(
        "id",
        entries.data.map((e) => e.contact_id),
      ),
    supabase
      .from("onboarding_pathways")
      .select("id, name")
      .in(
        "id",
        entries.data.map((e) => e.pathway_id),
      ),
  ]);
  const entry = new Map(entries.data.map((e) => [e.id, e]));
  const contact = new Map((contacts.data ?? []).map((c) => [c.id, c.display_name]));
  const pathway = new Map((pathways.data ?? []).map((p) => [p.id, p.name]));
  const poolRows = pools.error ? [] : (pools.data ?? []);
  return tasks.data.map((t) => {
    const e = entry.get(t.entry_id);
    const pool = poolRows
      .filter((p) => p.task_id === t.id)
      .map((p) => ({ id: p.user_id, name: p.display_name }));
    return {
      id: t.id,
      entryId: t.entry_id,
      title: t.title,
      detail: t.detail,
      kind: t.kind,
      personName: e ? (contact.get(e.contact_id) ?? "Someone") : "Someone",
      pathwayName: e ? (pathway.get(e.pathway_id) ?? "") : "",
      assigneeId: t.assignee_id,
      assigneeName: t.assignee_id
        ? (pool.find((p) => p.id === t.assignee_id)?.name ?? "A leader")
        : null,
      dueAt: t.due_at,
      doneAt: t.done_at,
      pool,
    };
  });
}

// ---------------------------------------------------------------------------
// Volunteers
// ---------------------------------------------------------------------------

export async function submitInterest(input: {
  name: string;
  email: string;
  phone: string;
  message: string;
  interests: string[];
  website: string;
}): Promise<OnboardingResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("submit_interest", {
    p_name: input.name,
    p_email: input.email,
    p_phone: input.phone,
    p_message: input.message,
    p_interests: input.interests,
    p_website: input.website,
  });
  return result(error);
}

export async function getMyOnboarding() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("my_onboarding");
  if (error) {
    return [];
  }
  return data.map((row) => ({
    entryId: row.entry_id,
    pathwayName: row.pathway_name,
    status: row.status,
    stepTitle: row.step_title,
    stepKind: row.step_kind,
    stepPosition: row.step_position,
    currentPosition: row.current_position,
    contactName: row.contact_name,
  }));
}

export async function chooseDepartment(
  entryId: string,
  departmentId: string,
): Promise<OnboardingResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("onboarding_choose_department", {
    p_entry_id: entryId,
    p_department_id: departmentId,
  });
  return result(error);
}

/** Open departments for the public form's "What interests you?" (names and icons only). */
export async function getOpenDepartments(): Promise<
  { id: string; name: string; hue: string; icon: string }[]
> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("open_departments");
  return error ? [] : data;
}
