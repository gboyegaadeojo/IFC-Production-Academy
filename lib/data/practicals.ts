import "server-only";
import { createSupabaseServerClient } from "@/lib/data/supabase/server";
import { hasCapability, type CapabilityGrant } from "@/lib/domain/capabilities";
import { reorder, toCurriculumError, type CurriculumError } from "@/lib/domain/curriculum";
import {
  toPracticalError,
  type PracticalError,
  type PracticalOutcome,
  type PracticalSettings,
} from "@/lib/domain/practical";

// Practical assessments (SRS-ASSESS-001..008). Checklists are edited in course drafts like lessons.
// Observers record what they saw through record_practical_assessment, which works out the outcome
// and grants the competency on a pass. Reads go through row-level security.

type Client = Awaited<ReturnType<typeof createSupabaseServerClient>>;
type EditResult = { ok: true } | { ok: false; error: CurriculumError };
type WithId<T, E> = { ok: true; id: T } | { ok: false; error: E };
export type PracticalResult = { ok: true } | { ok: false; error: PracticalError };

function editFail(error: { code?: string; message?: string } | null): {
  ok: false;
  error: CurriculumError;
} {
  return { ok: false, error: toCurriculumError(error) };
}
function practicalFail(error: { code?: string; message?: string } | null): {
  ok: false;
  error: PracticalError;
} {
  return { ok: false, error: toPracticalError(error) };
}
function updated(result: {
  data: unknown[] | null;
  error: { code?: string; message?: string } | null;
}): EditResult {
  if (result.error) {
    return editFail(result.error);
  }
  return (result.data?.length ?? 0) > 0 ? { ok: true } : editFail({ code: "42501" });
}

export type Criterion = {
  id: string;
  label: string;
  description: string;
  isRequired: boolean;
  sortOrder: number;
};

const PRACTICAL_COLUMNS =
  "id, practical_key, course_version_id, title, intro, after_module_key, competency_id, is_required, require_all_required, pass_min_percent, retry_wait_days, sort_order";

type PracticalRow = {
  id: string;
  practical_key: string;
  course_version_id: string;
  title: string;
  intro: string;
  after_module_key: string | null;
  competency_id: string | null;
  is_required: boolean;
  require_all_required: boolean;
  pass_min_percent: number;
  retry_wait_days: number;
  sort_order: number;
};

export type PracticalDetail = {
  id: string;
  key: string;
  courseVersionId: string;
  title: string;
  intro: string;
  afterModuleKey: string | null;
  competency: { id: string; name: string } | null;
  isRequired: boolean;
  requireAllRequired: boolean;
  passMinPercent: number;
  retryWaitDays: number;
  criteria: Criterion[];
};

async function withCriteria(supabase: Client, rows: PracticalRow[]): Promise<PracticalDetail[]> {
  if (rows.length === 0) {
    return [];
  }
  const competencyIds = rows.flatMap((row) => (row.competency_id ? [row.competency_id] : []));
  const [criteria, competencies] = await Promise.all([
    supabase
      .from("practical_criteria")
      .select("id, practical_id, label, description, is_required, sort_order")
      .in(
        "practical_id",
        rows.map((row) => row.id),
      )
      .order("sort_order"),
    competencyIds.length
      ? supabase.from("competencies").select("id, name").in("id", competencyIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[], error: null }),
  ]);
  if (criteria.error || competencies.error) {
    throw new Error("Could not load practicals", {
      cause: (criteria.error ?? competencies.error)?.code,
    });
  }
  return rows.map((row) => ({
    id: row.id,
    key: row.practical_key,
    courseVersionId: row.course_version_id,
    title: row.title,
    intro: row.intro,
    afterModuleKey: row.after_module_key,
    competency: competencies.data.find((c) => c.id === row.competency_id) ?? null,
    isRequired: row.is_required,
    requireAllRequired: row.require_all_required,
    passMinPercent: row.pass_min_percent,
    retryWaitDays: row.retry_wait_days,
    criteria: criteria.data
      .filter((c) => c.practical_id === row.id)
      .map((c) => ({
        id: c.id,
        label: c.label,
        description: c.description,
        isRequired: c.is_required,
        sortOrder: c.sort_order,
      })),
  }));
}

/** A version's practicals with their checklists, in order. */
export async function getVersionPracticals(versionId: string): Promise<PracticalDetail[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("practicals")
    .select(PRACTICAL_COLUMNS)
    .eq("course_version_id", versionId)
    .order("sort_order");
  if (error) {
    throw new Error("Could not load practicals", { cause: error.code });
  }
  return withCriteria(supabase, data);
}

/** One practical in a version, by key. Null if not readable. */
export async function getPracticalByKey(
  versionId: string,
  practicalKey: string,
): Promise<PracticalDetail | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("practicals")
    .select(PRACTICAL_COLUMNS)
    .eq("course_version_id", versionId)
    .eq("practical_key", practicalKey)
    .maybeSingle();
  if (error) {
    throw new Error("Could not load the practical", { cause: error.code });
  }
  return data ? ((await withCriteria(supabase, [data]))[0] ?? null) : null;
}

// ---------------------------------------------------------------------------
// Learner
// ---------------------------------------------------------------------------

export type AssessmentRecord = {
  id: string;
  outcome: PracticalOutcome;
  assessedAt: string;
  voidedAt: string | null;
  voidReason: string | null;
  observerName: string;
  feedback: string;
  observedIds: string[];
  criteriaCount: number;
  observedCount: number;
  requiredCount: number;
  requiredObserved: number;
};

const ASSESSMENT_COLUMNS =
  "id, user_id, outcome, assessed_at, voided_at, void_reason, observer_name, feedback, observed_criterion_ids, criteria_count, observed_count, required_count, required_observed, practical_key, course_id, department_id";

type AssessmentRow = {
  id: string;
  user_id: string;
  outcome: PracticalOutcome;
  assessed_at: string;
  voided_at: string | null;
  void_reason: string | null;
  observer_name: string;
  feedback: string;
  observed_criterion_ids: string[];
  criteria_count: number;
  observed_count: number;
  required_count: number;
  required_observed: number;
  practical_key: string;
  course_id: string;
  department_id: string;
};

function toAssessment(row: AssessmentRow): AssessmentRecord {
  return {
    id: row.id,
    outcome: row.outcome,
    assessedAt: row.assessed_at,
    voidedAt: row.voided_at,
    voidReason: row.void_reason,
    observerName: row.observer_name,
    feedback: row.feedback,
    observedIds: row.observed_criterion_ids,
    criteriaCount: row.criteria_count,
    observedCount: row.observed_count,
    requiredCount: row.required_count,
    requiredObserved: row.required_observed,
  };
}

/** The learner's assessments for a practical, newest first, and their open request if any. */
export async function getMyPracticalStatus(
  userId: string,
  courseId: string,
  practicalKey: string,
): Promise<{ assessments: AssessmentRecord[]; openRequestId: string | null }> {
  const supabase = await createSupabaseServerClient();
  const [assessments, requests] = await Promise.all([
    supabase
      .from("practical_assessments")
      .select(ASSESSMENT_COLUMNS)
      .eq("user_id", userId)
      .eq("course_id", courseId)
      .eq("practical_key", practicalKey)
      .order("assessed_at", { ascending: false }),
    supabase
      .from("assessment_requests")
      .select("id")
      .eq("user_id", userId)
      .eq("course_id", courseId)
      .eq("practical_key", practicalKey)
      .is("closed_at", null)
      .maybeSingle(),
  ]);
  if (assessments.error || requests.error) {
    throw new Error("Could not load assessments", {
      cause: (assessments.error ?? requests.error)?.code,
    });
  }
  return {
    assessments: assessments.data.map(toAssessment),
    openRequestId: requests.data?.id ?? null,
  };
}

/** Practical keys the learner has passed (not voided), per course. */
export async function getPassedPracticalKeys(
  userId: string,
  courseIds: readonly string[],
): Promise<Map<string, Set<string>>> {
  const passed = new Map<string, Set<string>>();
  if (courseIds.length === 0) {
    return passed;
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("practical_assessments")
    .select("course_id, practical_key")
    .eq("user_id", userId)
    .eq("outcome", "pass")
    .is("voided_at", null)
    .in("course_id", [...courseIds]);
  if (error) {
    throw new Error("Could not load assessments", { cause: error.code });
  }
  for (const row of data) {
    passed.set(row.course_id, (passed.get(row.course_id) ?? new Set()).add(row.practical_key));
  }
  return passed;
}

export async function requestAssessment(
  courseId: string,
  practicalKey: string,
): Promise<PracticalResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("request_assessment", {
    p_course_id: courseId,
    p_practical_key: practicalKey,
  });
  return error ? practicalFail(error) : { ok: true };
}

export async function cancelAssessmentRequest(requestId: string): Promise<PracticalResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("cancel_assessment_request", { p_request_id: requestId });
  return error ? practicalFail(error) : { ok: true };
}

// ---------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------

export type PracticalEditor = PracticalDetail & {
  courseId: string;
  departmentId: string;
  editable: boolean;
  modules: { key: string; title: string }[];
  competencies: { id: string; name: string }[];
};

export async function getPracticalEditor(practicalId: string): Promise<PracticalEditor | null> {
  const supabase = await createSupabaseServerClient();
  const row = await supabase
    .from("practicals")
    .select(PRACTICAL_COLUMNS)
    .eq("id", practicalId)
    .maybeSingle();
  if (row.error) {
    throw new Error("Could not load the practical", { cause: row.error.code });
  }
  if (!row.data) {
    return null;
  }
  const [detail] = await withCriteria(supabase, [row.data]);
  const version = await supabase
    .from("course_versions")
    .select("course_id, status")
    .eq("id", row.data.course_version_id)
    .single();
  if (version.error || !detail) {
    throw new Error("Could not load the practical", { cause: version.error?.code });
  }
  const course = await supabase
    .from("courses")
    .select("department_id")
    .eq("id", version.data.course_id)
    .single();
  if (course.error) {
    throw new Error("Could not load the practical", { cause: course.error.code });
  }
  const [modules, competencies] = await Promise.all([
    supabase
      .from("course_modules")
      .select("module_key, title")
      .eq("course_version_id", row.data.course_version_id)
      .order("sort_order"),
    supabase
      .from("competencies")
      .select("id, name")
      .eq("department_id", course.data.department_id)
      .is("archived_at", null)
      .order("name"),
  ]);
  if (modules.error || competencies.error) {
    throw new Error("Could not load the practical", {
      cause: (modules.error ?? competencies.error)?.code,
    });
  }
  return {
    ...detail,
    courseId: version.data.course_id,
    departmentId: course.data.department_id,
    editable: version.data.status === "draft",
    modules: modules.data.map((m) => ({ key: m.module_key, title: m.title })),
    competencies: competencies.data,
  };
}

function nextOrder(rows: readonly { sort_order: number }[]): number {
  return rows.reduce((max, row) => Math.max(max, row.sort_order), 0) + 10;
}

export async function addPractical(
  versionId: string,
  practical: { title: string; placement: string },
): Promise<WithId<string, CurriculumError>> {
  const supabase = await createSupabaseServerClient();
  const existing = await supabase
    .from("practicals")
    .select("sort_order")
    .eq("course_version_id", versionId);
  const { data, error } = await supabase
    .from("practicals")
    .insert({
      course_version_id: versionId,
      title: practical.title,
      after_module_key: practical.placement === "end" ? null : practical.placement,
      sort_order: nextOrder(existing.data ?? []),
    })
    .select("id")
    .single();
  return error ? editFail(error) : { ok: true, id: data.id };
}

export async function updatePractical(
  practicalId: string,
  settings: PracticalSettings,
): Promise<EditResult> {
  const supabase = await createSupabaseServerClient();
  return updated(
    await supabase
      .from("practicals")
      .update({
        title: settings.title,
        intro: settings.intro,
        after_module_key: settings.placement === "end" ? null : settings.placement,
        competency_id: settings.competencyId,
        is_required: settings.isRequired,
        require_all_required: settings.requireAllRequired,
        pass_min_percent: settings.passMinPercent,
        retry_wait_days: settings.retryWaitDays,
      })
      .eq("id", practicalId)
      .select("id"),
  );
}

export async function deletePractical(practicalId: string): Promise<EditResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("delete_practical", { p_practical_id: practicalId });
  return error ? editFail(error) : { ok: true };
}

export async function addCriterion(
  practicalId: string,
  versionId: string,
  criterion: { label: string; description: string; isRequired: boolean },
): Promise<EditResult> {
  const supabase = await createSupabaseServerClient();
  const existing = await supabase
    .from("practical_criteria")
    .select("sort_order")
    .eq("practical_id", practicalId);
  const { error } = await supabase.from("practical_criteria").insert({
    practical_id: practicalId,
    course_version_id: versionId,
    label: criterion.label,
    description: criterion.description,
    is_required: criterion.isRequired,
    sort_order: nextOrder(existing.data ?? []),
  });
  return error ? editFail(error) : { ok: true };
}

export async function deleteCriterion(criterionId: string): Promise<EditResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("delete_practical_criterion", {
    p_criterion_id: criterionId,
  });
  return error ? editFail(error) : { ok: true };
}

export async function moveCriterion(
  criterionId: string,
  direction: "up" | "down",
): Promise<EditResult> {
  const supabase = await createSupabaseServerClient();
  const item = await supabase
    .from("practical_criteria")
    .select("practical_id")
    .eq("id", criterionId)
    .maybeSingle();
  if (item.error || !item.data) {
    return editFail(item.error ?? { code: "42501" });
  }
  const siblings = await supabase
    .from("practical_criteria")
    .select("id, sort_order")
    .eq("practical_id", item.data.practical_id);
  if (siblings.error) {
    return editFail(siblings.error);
  }
  for (const change of reorder(
    siblings.data.map((row) => ({ id: row.id, sortOrder: row.sort_order })),
    criterionId,
    direction,
  )) {
    const result = updated(
      await supabase
        .from("practical_criteria")
        .update({ sort_order: change.sortOrder })
        .eq("id", change.id)
        .select("id"),
    );
    if (!result.ok) {
      return result;
    }
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Observers (SRS-ASSESS-003..006, ADD-ASSESS-01)
// ---------------------------------------------------------------------------

export type LivePractical = {
  courseId: string;
  departmentId: string;
  courseTitle: string;
  practical: PracticalDetail;
};

/** Live practicals in the departments the person assesses for, by course. */
export async function getLivePracticals(departmentIds: string[]): Promise<LivePractical[]> {
  if (departmentIds.length === 0) {
    return [];
  }
  const supabase = await createSupabaseServerClient();
  const courses = await supabase
    .from("courses")
    .select("id, department_id")
    .in("department_id", departmentIds)
    .is("archived_at", null);
  if (courses.error) {
    throw new Error("Could not load courses", { cause: courses.error.code });
  }
  if (courses.data.length === 0) {
    return [];
  }
  const versions = await supabase
    .from("course_versions")
    .select("id, course_id, title")
    .eq("status", "published")
    .in(
      "course_id",
      courses.data.map((c) => c.id),
    );
  if (versions.error) {
    throw new Error("Could not load courses", { cause: versions.error.code });
  }
  if (versions.data.length === 0) {
    return [];
  }
  const rows = await supabase
    .from("practicals")
    .select(PRACTICAL_COLUMNS)
    .in(
      "course_version_id",
      versions.data.map((v) => v.id),
    )
    .order("sort_order");
  if (rows.error) {
    throw new Error("Could not load practicals", { cause: rows.error.code });
  }
  const details = await withCriteria(supabase, rows.data);
  return details.flatMap((practical) => {
    const version = versions.data.find((v) => v.id === practical.courseVersionId);
    const course = courses.data.find((c) => c.id === version?.course_id);
    return version && course
      ? [
          {
            courseId: version.course_id,
            departmentId: course.department_id,
            courseTitle: version.title,
            practical,
          },
        ]
      : [];
  });
}

/** Active members of a department, for choosing whom to assess. */
export async function getAssessableMembers(
  departmentId: string,
): Promise<{ id: string; name: string }[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("assessable_members", {
    p_department_id: departmentId,
  });
  if (error) {
    throw new Error("Could not load members", { cause: error.code });
  }
  return data.map((row) => ({ id: row.user_id, name: row.display_name }));
}

export type QueueEntry = {
  requestId: string;
  learnerId: string;
  learnerName: string;
  courseId: string;
  practicalKey: string;
  requestedAt: string;
};

/** Open assessment requests in the departments the person assesses for, oldest first. */
export async function getAssessmentQueue(
  grants: readonly CapabilityGrant[],
  departmentIds: string[],
): Promise<QueueEntry[]> {
  const assessFor = departmentIds.filter((id) => hasCapability(grants, "assessment.record", id));
  if (assessFor.length === 0) {
    return [];
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("assessment_requests")
    .select("id, user_id, course_id, practical_key, department_id, requested_at")
    .in("department_id", assessFor)
    .is("closed_at", null)
    .order("requested_at");
  if (error) {
    throw new Error("Could not load requests", { cause: error.code });
  }
  const names = new Map<string, string>();
  for (const departmentId of new Set(data.map((row) => row.department_id))) {
    for (const member of await getAssessableMembers(departmentId)) {
      names.set(member.id, member.name);
    }
  }
  return data.flatMap((row) => {
    const name = names.get(row.user_id);
    return name
      ? [
          {
            requestId: row.id,
            learnerId: row.user_id,
            learnerName: name,
            courseId: row.course_id,
            practicalKey: row.practical_key,
            requestedAt: row.requested_at,
          },
        ]
      : [];
  });
}

export type RecentAssessment = AssessmentRecord & {
  learnerId: string;
  learnerName: string;
  courseId: string;
  practicalKey: string;
  departmentId: string;
};

/** The latest assessments in the departments the person can see readiness for. */
export async function getRecentAssessments(departmentIds: string[]): Promise<RecentAssessment[]> {
  if (departmentIds.length === 0) {
    return [];
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("practical_assessments")
    .select(ASSESSMENT_COLUMNS)
    .in("department_id", departmentIds)
    .order("assessed_at", { ascending: false })
    .limit(50);
  if (error) {
    throw new Error("Could not load assessments", { cause: error.code });
  }
  const names = new Map<string, string>();
  for (const departmentId of new Set(data.map((row) => row.department_id))) {
    try {
      for (const member of await getAssessableMembers(departmentId)) {
        names.set(member.id, member.name);
      }
    } catch {
      // Not an assessor here: names stay unknown.
    }
  }
  return data.map((row) => ({
    ...toAssessment(row),
    learnerId: row.user_id,
    learnerName: names.get(row.user_id) ?? "Former member",
    courseId: row.course_id,
    practicalKey: row.practical_key,
    departmentId: row.department_id,
  }));
}

export async function recordAssessment(input: {
  courseId: string;
  practicalKey: string;
  learnerId: string;
  observedIds: string[];
  feedback: string;
}): Promise<WithId<{ assessmentId: string; outcome: PracticalOutcome }, PracticalError>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("record_practical_assessment", {
    p_course_id: input.courseId,
    p_practical_key: input.practicalKey,
    p_learner_id: input.learnerId,
    p_observed_criterion_ids: input.observedIds,
    p_feedback: input.feedback,
  });
  const row = data?.[0];
  if (error || !row) {
    return practicalFail(error);
  }
  return { ok: true, id: { assessmentId: row.assessment_id, outcome: row.outcome } };
}

export async function voidAssessment(
  assessmentId: string,
  reason: string,
): Promise<PracticalResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("void_practical_assessment", {
    p_assessment_id: assessmentId,
    p_reason: reason,
  });
  return error ? practicalFail(error) : { ok: true };
}
