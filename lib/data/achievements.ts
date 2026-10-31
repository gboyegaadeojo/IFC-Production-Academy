import "server-only";
import { getMyCertificates, type CertificateSummary } from "@/lib/data/certificates";
import { createSupabaseServerClient } from "@/lib/data/supabase/server";

// "Recent achievements" on Home (SPEC §7 "Home dashboard"): certificates earned and roles the
// person is Approved to Serve in. Kept apart, because a certificate is not approval to serve.

export type Achievements = {
  certificates: CertificateSummary[];
  approvedRoles: { roleId: string; roleName: string; departmentName: string; approvedAt: string }[];
};

export async function getMyAchievements(userId: string): Promise<Achievements> {
  const supabase = await createSupabaseServerClient();
  const [certificates, approvals] = await Promise.all([
    getMyCertificates(userId),
    supabase
      .from("serving_approvals")
      .select("role_id, department_id, approved_at")
      .eq("user_id", userId)
      .eq("status", "approved")
      .order("approved_at", { ascending: false }),
  ]);
  if (approvals.error) {
    throw new Error("Could not load approvals", { cause: approvals.error.code });
  }
  if (approvals.data.length === 0) {
    return { certificates: certificates.filter((c) => !c.revoked), approvedRoles: [] };
  }
  const [roles, departments] = await Promise.all([
    supabase
      .from("serving_roles")
      .select("id, name, archived_at")
      .in(
        "id",
        approvals.data.map((a) => a.role_id),
      ),
    supabase
      .from("departments")
      .select("id, name")
      .in("id", [...new Set(approvals.data.map((a) => a.department_id))]),
  ]);
  if (roles.error || departments.error) {
    throw new Error("Could not load approvals", {
      cause: (roles.error ?? departments.error)?.code,
    });
  }
  return {
    certificates: certificates.filter((c) => !c.revoked),
    approvedRoles: approvals.data.flatMap((approval) => {
      const role = roles.data.find((r) => r.id === approval.role_id && r.archived_at === null);
      const department = departments.data.find((d) => d.id === approval.department_id);
      return role && department
        ? [
            {
              roleId: role.id,
              roleName: role.name,
              departmentName: department.name,
              approvedAt: approval.approved_at,
            },
          ]
        : [];
    }),
  };
}
