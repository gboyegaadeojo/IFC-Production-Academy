import "server-only";
import { createSupabaseServerClient } from "@/lib/data/supabase/server";
import { toAdminError } from "@/lib/domain/admin";
import type { DepartmentStatus, EnrolmentMode } from "@/lib/domain/departments";
import type { AdminResult } from "./shared";

export type DepartmentSettings = {
  id: string;
  name: string;
  summary: string;
  status: DepartmentStatus;
  enrolmentMode: EnrolmentMode;
  curriculumRequiresReview: boolean;
  hue: string;
  icon: string;
  updatedAt: string;
};

/** Every department, including inactive ones (needs department.manage under RLS). */
export async function listDepartmentSettings(): Promise<DepartmentSettings[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("departments")
    .select(
      "id, name, summary, status, enrolment_mode, curriculum_requires_review, hue, icon, updated_at, sort_order",
    )
    .order("sort_order");
  if (error) {
    throw new Error("Could not load departments", { cause: error.code });
  }
  return data.map((row) => ({
    id: row.id,
    name: row.name,
    summary: row.summary,
    status: row.status,
    enrolmentMode: row.enrolment_mode,
    curriculumRequiresReview: row.curriculum_requires_review,
    hue: row.hue,
    icon: row.icon,
    updatedAt: row.updated_at,
  }));
}

export type DepartmentChanges = {
  name: string;
  summary: string;
  status: DepartmentStatus;
  enrolmentMode: EnrolmentMode;
  curriculumRequiresReview: boolean;
};

/** SRS-CUR-009: going live is a data change. The audit trigger records it. */
export async function updateDepartment(
  departmentId: string,
  changes: DepartmentChanges,
): Promise<AdminResult> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("departments")
    .update({
      name: changes.name,
      summary: changes.summary,
      status: changes.status,
      enrolment_mode: changes.enrolmentMode,
      curriculum_requires_review: changes.curriculumRequiresReview,
    })
    .eq("id", departmentId)
    .select("id");
  if (error) {
    return { ok: false, error: toAdminError(error) };
  }
  // RLS turns an unauthorized update into "no rows", so treat that as not authorized.
  return data.length === 1 ? { ok: true } : { ok: false, error: "not_authorized" };
}
