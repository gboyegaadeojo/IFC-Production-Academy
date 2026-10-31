import "server-only";
import { createSupabaseServerClient } from "@/lib/data/supabase/server";
import { hasCapability, type CapabilityGrant } from "@/lib/domain/capabilities";
import {
  isCourseReportState,
  isReadinessReportState,
  type CourseReportState,
  type ReadinessReportState,
} from "@/lib/domain/reports";

// Department reports (SRS-REPORT-001..007). The database functions check report.view and return
// names and training facts only: no emails, no mentoring notes.

export type ReportDepartment = { id: string; name: string; slug: string; canExport: boolean };

export async function getReportDepartments(
  grants: readonly CapabilityGrant[],
): Promise<ReportDepartment[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("departments")
    .select("id, name, slug, sort_order")
    .order("sort_order");
  if (error) {
    throw new Error("Could not load departments", { cause: error.code });
  }
  return data
    .filter((d) => hasCapability(grants, "report.view", d.id))
    .map((d) => ({
      id: d.id,
      name: d.name,
      slug: d.slug,
      canExport: hasCapability(grants, "report.export", d.id),
    }));
}

export type TrainingRow = {
  userId: string;
  name: string;
  joinedAt: string;
  courseId: string;
  courseTitle: string;
  level: number;
  state: CourseReportState;
  certificate: string | null;
};

export async function getTrainingReport(departmentId: string): Promise<TrainingRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("department_training_report", {
    p_department_id: departmentId,
  });
  if (error) {
    throw new Error("Could not load the training report", { cause: error.code });
  }
  return data.map((row) => ({
    userId: row.user_id,
    name: row.display_name,
    joinedAt: row.joined_at,
    courseId: row.course_id,
    courseTitle: row.course_title,
    level: row.level_number,
    state: isCourseReportState(row.state) ? row.state : "not_started",
    certificate: row.certificate_reference,
  }));
}

export type ReadinessRow = {
  userId: string;
  name: string;
  kind: "competency" | "role";
  item: string;
  state: ReadinessReportState;
  since: string | null;
  expiresAt: string | null;
};

export async function getReadinessReport(departmentId: string): Promise<ReadinessRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("department_readiness_report", {
    p_department_id: departmentId,
  });
  if (error) {
    throw new Error("Could not load the readiness report", { cause: error.code });
  }
  return data.map((row) => ({
    userId: row.user_id,
    name: row.display_name,
    kind: row.kind === "role" ? "role" : "competency",
    item: row.name,
    state: isReadinessReportState(row.state) ? row.state : "not_assessed",
    since: row.since,
    expiresAt: row.expires_at,
  }));
}

/** Audits an export before it's sent (SRS-REPORT-006). False if not allowed. */
export async function logReportExport(
  departmentId: string,
  report: "training" | "readiness",
  rows: number,
): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("log_report_export", {
    p_department_id: departmentId,
    p_report: report,
    p_rows: rows,
  });
  return !error;
}
