import "server-only";
import { createSupabaseServerClient } from "@/lib/data/supabase/server";
import { toAdminError } from "@/lib/domain/admin";
import { hasCapability, type CapabilityGrant } from "@/lib/domain/capabilities";
import type { MembershipStatus } from "@/lib/domain/departments";
import { peopleById, personFor, type AdminResult, type PersonSummary } from "./shared";

export type MembershipRow = {
  id: string;
  person: PersonSummary;
  status: MembershipStatus;
  requestedAt: string;
  decidedAt: string | null;
};

export type DepartmentMembers = {
  id: string;
  name: string;
  hue: string;
  icon: string;
  requests: MembershipRow[];
  members: MembershipRow[];
};

/**
 * Open requests and current members for each department the person may approve in (SRS-MEM-003).
 * Row-level security limits the rows; the capability filter keeps empty departments off the page.
 */
export async function listDepartmentMembers(
  grants: readonly CapabilityGrant[],
): Promise<DepartmentMembers[]> {
  const supabase = await createSupabaseServerClient();
  const [departmentsResult, membershipsResult] = await Promise.all([
    supabase.from("departments").select("id, name, hue, icon, sort_order").order("sort_order"),
    supabase
      .from("department_memberships")
      .select("id, department_id, user_id, status, requested_at, decided_at")
      .in("status", ["requested", "active"])
      .order("requested_at"),
  ]);
  if (departmentsResult.error) {
    throw new Error("Could not load departments", { cause: departmentsResult.error.code });
  }
  if (membershipsResult.error) {
    throw new Error("Could not load memberships", { cause: membershipsResult.error.code });
  }

  const people = await peopleById(
    supabase,
    membershipsResult.data.map((row) => row.user_id),
  );

  return departmentsResult.data
    .filter((department) => hasCapability(grants, "member.approve", department.id))
    .map((department) => {
      const rows = membershipsResult.data
        .filter((row) => row.department_id === department.id)
        .map((row): MembershipRow => ({
          id: row.id,
          person: personFor(people, row.user_id),
          status: row.status,
          requestedAt: row.requested_at,
          decidedAt: row.decided_at,
        }));
      return {
        id: department.id,
        name: department.name,
        hue: department.hue,
        icon: department.icon,
        requests: rows.filter((row) => row.status === "requested"),
        members: rows
          .filter((row) => row.status === "active")
          .toSorted((a, b) => a.person.displayName.localeCompare(b.person.displayName)),
      };
    });
}

/** Approve, decline, or remove (SRS-MEM-003). The database records actor, time, and reason. */
export async function decideMembership(
  membershipId: string,
  decision: "active" | "declined" | "removed",
  reason: string | null,
): Promise<AdminResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("decide_membership", {
    p_membership_id: membershipId,
    p_decision: decision,
    p_reason: reason,
  });
  return error ? { ok: false, error: toAdminError(error) } : { ok: true };
}
