import "server-only";
import { createSupabaseServerClient } from "@/lib/data/supabase/server";
import { describeAuditEvent } from "@/lib/domain/admin";
import { peopleById, personFor, type PersonSummary } from "./shared";

export type AuditEntry = {
  id: string;
  createdAt: string;
  description: string;
  actor: PersonSummary | null;
  /** The person the event is about, when there is one. */
  subject: PersonSummary | null;
  departmentName: string | null;
  roleName: string | null;
  /** Column names that changed (never their values), for the expandable detail. */
  changedFields: string[];
  /** Which kind of record the event is about, for example "courses". */
  targetTable: string;
};

export const AUDIT_PAGE_SIZE = 50;

/** Where the next page starts: the last entry shown. Events in one transaction share a time. */
export type AuditCursor = { createdAt: string; id: string };

/**
 * The audit log, newest first (SRS-AUDIT-001). Only names are resolved; row contents never appear.
 */
export async function listAuditEntries(before: AuditCursor | null): Promise<{
  entries: AuditEntry[];
  next: AuditCursor | null;
}> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("audit_events")
    .select("id, created_at, action, actor_id, target_table, target_id, department_id, metadata")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(AUDIT_PAGE_SIZE + 1);
  if (before) {
    // Values are validated (ISO timestamp, UUID) by the caller before they reach this filter.
    const at = `"${before.createdAt}"`;
    query = query.or(`created_at.lt.${at},and(created_at.eq.${at},id.lt.${before.id})`);
  }
  const { data, error } = await query;
  if (error) {
    throw new Error("Could not load the audit log", { cause: error.code });
  }

  const page = data.slice(0, AUDIT_PAGE_SIZE);
  const idsFor = (table: string) =>
    page
      .filter((event) => event.target_table === table && event.target_id)
      .map((event) => event.target_id as string);

  // Resolve who each event is about. RLS still applies: unknown rows simply stay unnamed.
  const [memberships, userRoles, roles, departments] = await Promise.all([
    supabase
      .from("department_memberships")
      .select("id, user_id")
      .in("id", idsFor("department_memberships")),
    supabase.from("user_roles").select("id, user_id, role_id").in("id", idsFor("user_roles")),
    supabase.from("roles").select("id, name"),
    supabase.from("departments").select("id, name"),
  ]);
  const subjectByTarget = new Map<string, string>();
  for (const row of memberships.data ?? []) {
    subjectByTarget.set(row.id, row.user_id);
  }
  for (const row of userRoles.data ?? []) {
    subjectByTarget.set(row.id, row.user_id);
  }
  for (const id of idsFor("profiles")) {
    subjectByTarget.set(id, id);
  }
  const roleName = new Map((roles.data ?? []).map((row) => [row.id, row.name]));
  const departmentName = new Map((departments.data ?? []).map((row) => [row.id, row.name]));

  const people = await peopleById(supabase, [
    ...page.flatMap((event) => (event.actor_id ? [event.actor_id] : [])),
    ...subjectByTarget.values(),
  ]);

  const entries = page.map((event): AuditEntry => {
    const subjectId = event.target_id ? subjectByTarget.get(event.target_id) : undefined;
    const roleId =
      typeof event.metadata === "object" &&
      event.metadata !== null &&
      !Array.isArray(event.metadata) &&
      typeof event.metadata.role_id === "string"
        ? event.metadata.role_id
        : null;
    return {
      id: event.id,
      createdAt: event.created_at,
      description: describeAuditEvent({ action: event.action, metadata: event.metadata }),
      actor: event.actor_id ? personFor(people, event.actor_id) : null,
      subject: subjectId ? personFor(people, subjectId) : null,
      departmentName: event.department_id
        ? (departmentName.get(event.department_id) ?? null)
        : null,
      roleName: roleId ? (roleName.get(roleId) ?? null) : null,
      changedFields:
        typeof event.metadata === "object" &&
        event.metadata !== null &&
        !Array.isArray(event.metadata) &&
        Array.isArray(event.metadata.changed)
          ? event.metadata.changed.filter((key): key is string => typeof key === "string")
          : [],
      targetTable: event.target_table,
    };
  });

  const last = page.at(-1);
  return {
    entries,
    next:
      data.length > AUDIT_PAGE_SIZE && last ? { createdAt: last.created_at, id: last.id } : null,
  };
}
