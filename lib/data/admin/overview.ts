import "server-only";
import { createSupabaseServerClient } from "@/lib/data/supabase/server";
import { getUnlinkedPlaces } from "@/lib/data/planning-center";
import { canOpenAdminSection, type AdminSectionKey } from "@/lib/domain/admin";
import type { CapabilityGrant } from "@/lib/domain/capabilities";
import { listAuditEntries, type AuditEntry } from "./audit";

/**
 * Admin dashboard figures (DESIGN §7.1). Each one is a real count, queried only when the person
 * may open that section, and row-level security limits it to their departments. A figure that
 * can't be derived is left out (null), never estimated.
 */
export type AdminOverview = {
  pendingRequests: number | null;
  draftsInProgress: number | null;
  awaitingReview: number | null;
  activeInvitations: number | null;
  people: { total: number; notActive: number } | null;
  departments: { active: number; comingSoon: number; inactive: number } | null;
  recentActivity: AuditEntry[] | null;
  /** Training figures per department (SPEC §7 "Leader dashboard"), for readiness viewers. */
  training: TrainingSummary[] | null;
};

export type TrainingSummary = {
  departmentId: string;
  departmentName: string;
  activeMembers: number;
  inProgress: number;
  awaitingAssessment: number;
  furtherPractice: number;
  approvedToServe: number;
  certificates: number;
};

type Counted = { count: number | null; error: { code?: string } | null };

function countOf(result: Counted, what: string): number {
  if (result.error) {
    throw new Error(`Could not count ${what}`, { cause: result.error.code });
  }
  return result.count ?? 0;
}

export async function getAdminOverview(grants: readonly CapabilityGrant[]): Promise<AdminOverview> {
  const supabase = await createSupabaseServerClient();
  const can = (key: Parameters<typeof canOpenAdminSection>[1]) => canOpenAdminSection(grants, key);
  const nowIso = new Date().toISOString();

  const [requests, drafts, review, invitations, people, notActive, departments, audit, training] =
    await Promise.all([
      can("members")
        ? supabase
            .from("department_memberships")
            .select("id", { count: "exact", head: true })
            .eq("status", "requested")
        : null,
      can("curriculum")
        ? supabase
            .from("course_versions")
            .select("id", { count: "exact", head: true })
            .eq("status", "draft")
        : null,
      can("curriculum")
        ? supabase
            .from("course_versions")
            .select("id", { count: "exact", head: true })
            .eq("status", "pending_review")
        : null,
      can("invitations")
        ? supabase
            .from("invitations")
            .select("max_uses, use_count")
            .is("revoked_at", null)
            .gt("expires_at", nowIso)
        : null,
      can("people") ? supabase.from("profiles").select("id", { count: "exact", head: true }) : null,
      can("people")
        ? supabase
            .from("profiles")
            .select("id", { count: "exact", head: true })
            .neq("status", "active")
        : null,
      can("departments") ? supabase.from("departments").select("status") : null,
      can("audit") ? listAuditEntries(null) : null,
      can("competencies") ? supabase.rpc("department_training_summary") : null,
    ]);

  if (invitations?.error) {
    throw new Error("Could not count invitations", { cause: invitations.error.code });
  }
  if (training?.error) {
    throw new Error("Could not load training figures", { cause: training.error.code });
  }
  if (departments?.error) {
    throw new Error("Could not count departments", { cause: departments.error.code });
  }

  return {
    pendingRequests: requests ? countOf(requests, "requests") : null,
    draftsInProgress: drafts ? countOf(drafts, "drafts") : null,
    awaitingReview: review ? countOf(review, "reviews") : null,
    activeInvitations: invitations
      ? invitations.data.filter((row) => row.use_count < row.max_uses).length
      : null,
    people:
      people && notActive
        ? { total: countOf(people, "people"), notActive: countOf(notActive, "accounts") }
        : null,
    departments: departments
      ? {
          active: departments.data.filter((d) => d.status === "active").length,
          comingSoon: departments.data.filter((d) => d.status === "coming_soon").length,
          inactive: departments.data.filter((d) => d.status === "inactive").length,
        }
      : null,
    recentActivity: audit ? audit.entries.slice(0, 6) : null,
    training: training
      ? training.data.map((row) => ({
          departmentId: row.department_id,
          departmentName: row.department_name,
          activeMembers: row.active_members,
          inProgress: row.in_progress,
          awaitingAssessment: row.awaiting_assessment,
          furtherPractice: row.further_practice,
          approvedToServe: row.approved_to_serve,
          certificates: row.certificates,
        }))
      : null,
  };
}

/**
 * Sidebar badges: real counts only, for sections the person may open, keyed by section. A count
 * of zero, or one that can't be read, shows no badge.
 */
export async function getAdminNavCounts(
  grants: readonly CapabilityGrant[],
): Promise<Partial<Record<AdminSectionKey, number>>> {
  const supabase = await createSupabaseServerClient();
  const [requests, unlinked] = await Promise.all([
    canOpenAdminSection(grants, "members")
      ? supabase
          .from("department_memberships")
          .select("id", { count: "exact", head: true })
          .eq("status", "requested")
      : null,
    canOpenAdminSection(grants, "planning-center")
      ? getUnlinkedPlaces().catch(() => [])
      : Promise.resolve([]),
  ]);
  const counts: Partial<Record<AdminSectionKey, number>> = {};
  if (requests && !requests.error && requests.count) {
    counts.members = requests.count;
  }
  if (unlinked.length > 0) {
    counts["planning-center"] = unlinked.length;
  }
  return counts;
}
