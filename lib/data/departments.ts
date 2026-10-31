import "server-only";
import { createSupabaseServerClient } from "@/lib/data/supabase/server";
import {
  browsableDepartments,
  currentMembershipByDepartment,
  departmentCardState,
  toRequestMembershipError,
  type Department,
  type DepartmentCardState,
  type Membership,
  type RequestMembershipError,
} from "@/lib/domain/departments";

export type DepartmentCard = Department & {
  state: DepartmentCardState;
  /** When the person's membership last changed: the request date, or the join date. */
  since: string | null;
};

/** Departments the person may browse, each with what they can do next (SRS-MEM-006). */
export async function listDepartmentCards(userId: string): Promise<DepartmentCard[]> {
  const supabase = await createSupabaseServerClient();

  const [departmentsResult, membershipsResult] = await Promise.all([
    supabase
      .from("departments")
      .select("id, slug, name, summary, status, enrolment_mode, hue, icon, sort_order")
      .order("sort_order"),
    // Leaders can read other people's memberships too, so filter to this person explicitly.
    supabase
      .from("department_memberships")
      .select("id, department_id, status, updated_at")
      .eq("user_id", userId),
  ]);
  if (departmentsResult.error) {
    throw new Error("Could not load departments", { cause: departmentsResult.error.code });
  }
  if (membershipsResult.error) {
    throw new Error("Could not load memberships", { cause: membershipsResult.error.code });
  }

  const departments: Department[] = departmentsResult.data.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    summary: row.summary,
    status: row.status,
    enrolmentMode: row.enrolment_mode,
    hue: row.hue,
    icon: row.icon,
    sortOrder: row.sort_order,
  }));
  const memberships: Membership[] = membershipsResult.data.map((row) => ({
    id: row.id,
    departmentId: row.department_id,
    status: row.status,
    updatedAt: row.updated_at,
  }));
  const membershipByDepartment = currentMembershipByDepartment(memberships);

  return browsableDepartments(departments).map((department) => ({
    ...department,
    state: departmentCardState(department, membershipByDepartment.get(department.id)),
    since: membershipByDepartment.get(department.id)?.updatedAt ?? null,
  }));
}

export type RequestMembershipResult = { ok: true } | { ok: false; error: RequestMembershipError };

/** SRS-MEM-001. Safe to retry: the database returns the existing request instead of a duplicate. */
export async function requestMembership(departmentId: string): Promise<RequestMembershipResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("request_membership", { p_department_id: departmentId });
  if (error) {
    return { ok: false, error: toRequestMembershipError(error.message) };
  }
  return { ok: true };
}

/** Every department's id the person can see, in display order. */
export async function listDepartmentIds(): Promise<string[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("departments").select("id").order("sort_order");
  if (error) {
    throw new Error("Could not load departments", { cause: error.code });
  }
  return data.map((row) => row.id);
}
