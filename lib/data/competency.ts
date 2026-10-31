import "server-only";
import { peopleById, personFor, type PersonSummary } from "@/lib/data/admin/shared";
import { createSupabaseServerClient } from "@/lib/data/supabase/server";
import { hasCapability, type CapabilityGrant } from "@/lib/domain/capabilities";
import {
  roleReadiness,
  toCompetencyError,
  type CompetencyError,
  type CompetencyRecord,
  type RoleReadiness,
} from "@/lib/domain/competency";

// Competencies, serving roles, and Approved to Serve (SRS-COMP-001..004). Reads go through
// row-level security; every change goes through RLS-checked inserts and updates or database
// functions, and the database works out Approved to Serve itself.

type Client = Awaited<ReturnType<typeof createSupabaseServerClient>>;
export type CompetencyResult = { ok: true } | { ok: false; error: CompetencyError };

function fail(error: { code?: string; message?: string } | null): {
  ok: false;
  error: CompetencyError;
} {
  return { ok: false, error: toCompetencyError(error) };
}

function updated(result: {
  data: unknown[] | null;
  error: { code?: string; message?: string } | null;
}): CompetencyResult {
  if (result.error) {
    return fail(result.error);
  }
  return (result.data?.length ?? 0) > 0 ? { ok: true } : fail({ code: "42501" });
}

export type Competency = {
  id: string;
  name: string;
  description: string;
  expiryMonths: number | null;
};

export type ServingRole = {
  id: string;
  name: string;
  description: string;
  /** Required competencies, by name. */
  required: { id: string; name: string }[];
};

export type ReadinessSetup = { competencies: Competency[]; roles: ServingRole[] };

async function loadSetup(supabase: Client, departmentIds: string[]) {
  const [competencies, roles, requirements] = await Promise.all([
    supabase
      .from("competencies")
      .select("id, department_id, name, description, expiry_months")
      .in("department_id", departmentIds)
      .is("archived_at", null)
      .order("name"),
    supabase
      .from("serving_roles")
      .select("id, department_id, name, description")
      .in("department_id", departmentIds)
      .is("archived_at", null)
      .order("name"),
    supabase
      .from("serving_role_competencies")
      .select("role_id, competency_id")
      .in("department_id", departmentIds),
  ]);
  if (competencies.error || roles.error || requirements.error) {
    throw new Error("Could not load competencies", {
      cause: (competencies.error ?? roles.error ?? requirements.error)?.code,
    });
  }
  const byDepartment = new Map<string, ReadinessSetup>();
  for (const id of departmentIds) {
    const list = competencies.data.filter((c) => c.department_id === id);
    byDepartment.set(id, {
      competencies: list.map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        expiryMonths: c.expiry_months,
      })),
      roles: roles.data
        .filter((r) => r.department_id === id)
        .map((r) => ({
          id: r.id,
          name: r.name,
          description: r.description,
          required: list
            .filter((c) =>
              requirements.data.some((q) => q.role_id === r.id && q.competency_id === c.id),
            )
            .map((c) => ({ id: c.id, name: c.name })),
        })),
    });
  }
  return byDepartment;
}

function toRecord(row: {
  id: string;
  competency_id: string;
  status: "approved" | "suspended";
  granted_at: string;
  expires_at: string | null;
  suspend_reason: string | null;
}): CompetencyRecord {
  return {
    id: row.id,
    competencyId: row.competency_id,
    status: row.status,
    grantedAt: row.granted_at,
    expiresAt: row.expires_at,
    suspendReason: row.suspend_reason,
  };
}

const RECORD_COLUMNS = "id, user_id, competency_id, status, granted_at, expires_at, suspend_reason";

export type MyReadiness = {
  competencies: (Competency & { record: CompetencyRecord | undefined })[];
  roles: (ServingRole & { readiness: RoleReadiness; approvedAt: string | null })[];
};

/** Where the learner stands in one department: competencies and Approved to Serve per role. */
export async function getMyReadiness(userId: string, departmentId: string): Promise<MyReadiness> {
  const supabase = await createSupabaseServerClient();
  const [setup, records, approvals] = await Promise.all([
    loadSetup(supabase, [departmentId]),
    supabase
      .from("competency_records")
      .select(RECORD_COLUMNS)
      .eq("user_id", userId)
      .eq("department_id", departmentId),
    supabase
      .from("serving_approvals")
      .select("role_id, status, approved_at")
      .eq("user_id", userId)
      .eq("department_id", departmentId),
  ]);
  if (records.error || approvals.error) {
    throw new Error("Could not load readiness", {
      cause: (records.error ?? approvals.error)?.code,
    });
  }
  const { competencies, roles } = setup.get(departmentId) ?? { competencies: [], roles: [] };
  const byCompetency = new Map(records.data.map((row) => [row.competency_id, toRecord(row)]));
  const now = new Date();
  return {
    competencies: competencies.map((c) => ({ ...c, record: byCompetency.get(c.id) })),
    roles: roles.map((role) => {
      const approval = approvals.data.find((a) => a.role_id === role.id);
      const readiness = roleReadiness(role.required, byCompetency, approval, now);
      return {
        ...role,
        readiness,
        approvedAt: readiness.approved ? (approval?.approved_at ?? null) : null,
      };
    }),
  };
}

export type PersonReadiness = {
  person: PersonSummary;
  records: Map<string, CompetencyRecord>;
  approvedRoleIds: Set<string>;
};

export type DepartmentReadinessAdmin = {
  id: string;
  name: string;
  canManage: boolean;
  setup: ReadinessSetup;
  people: PersonReadiness[];
};

/** Competencies, roles, and everyone's records for departments the person can see readiness in. */
export async function getReadinessAdmin(
  grants: readonly CapabilityGrant[],
): Promise<DepartmentReadinessAdmin[]> {
  const supabase = await createSupabaseServerClient();
  const departments = await supabase
    .from("departments")
    .select("id, name, sort_order")
    .order("sort_order");
  if (departments.error) {
    throw new Error("Could not load departments", { cause: departments.error.code });
  }
  const visible = departments.data.filter(
    (d) =>
      hasCapability(grants, "competency.approve", d.id) ||
      hasCapability(grants, "assessment.record", d.id) ||
      hasCapability(grants, "report.view", d.id),
  );
  const ids = visible.map((d) => d.id);
  if (ids.length === 0) {
    return [];
  }
  const [setup, records, approvals] = await Promise.all([
    loadSetup(supabase, ids),
    supabase
      .from("competency_records")
      .select(`${RECORD_COLUMNS}, department_id`)
      .in("department_id", ids),
    supabase
      .from("serving_approvals")
      .select("user_id, role_id, department_id, status")
      .in("department_id", ids)
      .eq("status", "approved"),
  ]);
  if (records.error || approvals.error) {
    throw new Error("Could not load readiness", {
      cause: (records.error ?? approvals.error)?.code,
    });
  }
  const people = await peopleById(supabase, [
    ...records.data.map((r) => r.user_id),
    ...approvals.data.map((a) => a.user_id),
  ]);
  return visible.map((department) => {
    const userIds = [
      ...new Set(
        records.data.filter((r) => r.department_id === department.id).map((r) => r.user_id),
      ),
    ];
    return {
      id: department.id,
      name: department.name,
      canManage: hasCapability(grants, "competency.approve", department.id),
      setup: setup.get(department.id) ?? { competencies: [], roles: [] },
      people: userIds
        .map((userId) => ({
          person: personFor(people, userId),
          records: new Map(
            records.data
              .filter((r) => r.user_id === userId && r.department_id === department.id)
              .map((r) => [r.competency_id, toRecord(r)]),
          ),
          approvedRoleIds: new Set(
            approvals.data
              .filter((a) => a.user_id === userId && a.department_id === department.id)
              .map((a) => a.role_id),
          ),
        }))
        .toSorted((a, b) => a.person.displayName.localeCompare(b.person.displayName)),
    };
  });
}

// ---------------------------------------------------------------------------
// Changes
// ---------------------------------------------------------------------------

export async function createCompetency(
  departmentId: string,
  competency: { name: string; description: string; expiryMonths: number | null },
): Promise<CompetencyResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("competencies").insert({
    department_id: departmentId,
    name: competency.name,
    description: competency.description,
    expiry_months: competency.expiryMonths,
  });
  return error ? fail(error) : { ok: true };
}

export async function updateCompetency(
  competencyId: string,
  competency: { name: string; description: string; expiryMonths: number | null },
): Promise<CompetencyResult> {
  const supabase = await createSupabaseServerClient();
  return updated(
    await supabase
      .from("competencies")
      .update({
        name: competency.name,
        description: competency.description,
        expiry_months: competency.expiryMonths,
      })
      .eq("id", competencyId)
      .select("id"),
  );
}

export async function archiveCompetency(competencyId: string): Promise<CompetencyResult> {
  const supabase = await createSupabaseServerClient();
  return updated(
    await supabase
      .from("competencies")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", competencyId)
      .is("archived_at", null)
      .select("id"),
  );
}

export async function createServingRole(
  departmentId: string,
  role: { name: string; description: string },
): Promise<CompetencyResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("serving_roles")
    .insert({ department_id: departmentId, name: role.name, description: role.description });
  return error ? fail(error) : { ok: true };
}

export async function archiveServingRole(roleId: string): Promise<CompetencyResult> {
  const supabase = await createSupabaseServerClient();
  return updated(
    await supabase
      .from("serving_roles")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", roleId)
      .is("archived_at", null)
      .select("id"),
  );
}

export async function setRoleCompetencies(
  roleId: string,
  competencyIds: string[],
): Promise<CompetencyResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_role_competencies", {
    p_role_id: roleId,
    p_competency_ids: competencyIds,
  });
  return error ? fail(error) : { ok: true };
}

export async function suspendCompetency(
  recordId: string,
  reason: string,
): Promise<CompetencyResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("suspend_competency", {
    p_record_id: recordId,
    p_reason: reason,
  });
  return error ? fail(error) : { ok: true };
}

export async function reinstateCompetency(recordId: string): Promise<CompetencyResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("reinstate_competency", { p_record_id: recordId });
  return error ? fail(error) : { ok: true };
}
