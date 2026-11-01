import "server-only";
import { createSupabaseServerClient } from "@/lib/data/supabase/server";
import { toAdminError } from "@/lib/domain/admin";
import {
  departmentSlug,
  type DepartmentStatus,
  type EnrolmentMode,
} from "@/lib/domain/departments";
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

/**
 * Adds a department (SRS-CUR-009: departments are data). The database gives it the three levels
 * straight away and the audit trigger records it; from then on it works like every other one:
 * curriculum, competencies, teams, checklists and an onboarding pathway can all be set up for it.
 */
export async function createDepartment(input: {
  /** The person adding it; their organisation owns the department. */
  userId: string;
  name: string;
  summary: string;
  hue: string;
  icon: string;
  status: DepartmentStatus;
  enrolmentMode: EnrolmentMode;
}): Promise<AdminResult & { id?: string }> {
  const supabase = await createSupabaseServerClient();
  const [existing, me] = await Promise.all([
    supabase.from("departments").select("slug, sort_order"),
    supabase.from("profiles").select("organization_id").eq("id", input.userId).maybeSingle(),
  ]);
  if (existing.error) {
    return { ok: false, error: toAdminError(existing.error) };
  }
  const organizationId = me.data?.organization_id ?? null;
  if (!organizationId) {
    return { ok: false, error: "not_authorized" };
  }
  const slug = departmentSlug(input.name, new Set(existing.data.map((d) => d.slug)));
  const sortOrder = Math.max(0, ...existing.data.map((d) => d.sort_order)) + 10;
  const { data, error } = await supabase
    .from("departments")
    .insert({
      organization_id: organizationId,
      slug,
      name: input.name,
      summary: input.summary,
      hue: input.hue,
      icon: input.icon,
      status: input.status,
      enrolment_mode: input.enrolmentMode,
      sort_order: sortOrder,
    })
    .select("id")
    .single();
  if (error) {
    return { ok: false, error: toAdminError(error) };
  }
  return { ok: true, id: data.id };
}
