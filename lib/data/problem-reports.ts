import "server-only";
import { createSupabaseServerClient } from "@/lib/data/supabase/server";

export type ProblemReport = {
  id: string;
  message: string;
  page: string;
  device: string;
  appVersion: string;
  status: "open" | "sorted";
  createdAt: string;
  sortedAt: string | null;
  reporterName: string;
  sortedByName: string | null;
};

/** Sends a report; the database notifies the platform admins. The error code on failure. */
export async function reportProblem(input: {
  message: string;
  page: string;
  device: string;
  appVersion: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("report_problem", {
    p_message: input.message,
    p_page: input.page,
    p_device: input.device,
    p_app_version: input.appVersion,
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Newest first: open ones, or all. The database checks problem.review. */
export async function listProblemReports(includeSorted: boolean): Promise<ProblemReport[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("problem_reports_list", {
    p_include_sorted: includeSorted,
  });
  if (error) {
    throw new Error("Could not load problem reports", { cause: error.code });
  }
  return data.map((row) => ({
    id: row.id,
    message: row.message,
    page: row.page,
    device: row.device,
    appVersion: row.app_version,
    status: row.status === "sorted" ? "sorted" : "open",
    createdAt: row.created_at,
    sortedAt: row.sorted_at,
    reporterName: row.reporter_name,
    sortedByName: row.sorted_by_name,
  }));
}

/** Marks a report sorted, or open again. Audited by the database. */
export async function setProblemReportStatus(id: string, sorted: boolean): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_problem_report_status", { p_id: id, p_sorted: sorted });
  return !error;
}
