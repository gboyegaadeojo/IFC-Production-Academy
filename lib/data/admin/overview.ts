import "server-only";
import { getCurrentUser } from "@/lib/data/auth";
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
  /** Onboarding follow-ups that are yours, or anyone's to take. */
  followUps: number | null;
  /** Unpublished drafts of courses still in the curriculum, with up to two titles to name them. */
  drafts: { count: number; titles: string[] } | null;
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
  hue: string;
  icon: string;
  comingSoon: boolean;
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

/** Open follow-ups that are yours, or not taken yet (row-level security limits it to your pathways). */
async function countFollowUps(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
): Promise<number> {
  const user = await getCurrentUser();
  if (!user) {
    return 0;
  }
  const { count, error } = await supabase
    .from("onboarding_tasks")
    .select("id", { count: "exact", head: true })
    .is("done_at", null)
    .or(`assignee_id.eq.${user.id},assignee_id.is.null`);
  return error ? 0 : (count ?? 0);
}

export async function getAdminOverview(grants: readonly CapabilityGrant[]): Promise<AdminOverview> {
  const supabase = await createSupabaseServerClient();
  const can = (key: Parameters<typeof canOpenAdminSection>[1]) => canOpenAdminSection(grants, key);
  const nowIso = new Date().toISOString();

  const [
    requests,
    drafts,
    archivedCourses,
    review,
    invitations,
    people,
    notActive,
    departments,
    audit,
    training,
    trainingDepartments,
    followUps,
  ] = await Promise.all([
    can("members")
      ? supabase
          .from("department_memberships")
          .select("id", { count: "exact", head: true })
          .eq("status", "requested")
      : null,
    can("curriculum")
      ? supabase
          .from("course_versions")
          .select("course_id, title, created_at")
          .eq("status", "draft")
          .order("created_at", { ascending: false })
      : null,
    can("curriculum") ? supabase.from("courses").select("id").not("archived_at", "is", null) : null,
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
    can("competencies") ? supabase.from("departments").select("id, hue, icon, status") : null,
    can("onboarding-follow-ups") ? countFollowUps(supabase) : null,
  ]);

  if (drafts?.error || archivedCourses?.error) {
    throw new Error("Could not count drafts", {
      cause: (drafts?.error ?? archivedCourses?.error)?.code,
    });
  }
  if (trainingDepartments?.error) {
    throw new Error("Could not load departments", { cause: trainingDepartments.error.code });
  }
  // A course archived or deleted keeps its draft row; it isn't waiting on anyone.
  const archived = new Set((archivedCourses?.data ?? []).map((row) => row.id));
  const liveDrafts = drafts ? drafts.data.filter((row) => !archived.has(row.course_id)) : null;
  const departmentById = new Map((trainingDepartments?.data ?? []).map((d) => [d.id, d]));

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
    followUps,
    drafts: liveDrafts
      ? { count: liveDrafts.length, titles: liveDrafts.slice(0, 2).map((row) => row.title) }
      : null,
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
          hue: departmentById.get(row.department_id)?.hue ?? "",
          icon: departmentById.get(row.department_id)?.icon ?? "",
          comingSoon: departmentById.get(row.department_id)?.status === "coming_soon",
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
