import "server-only";
import { createSupabaseServerClient } from "@/lib/data/supabase/server";
import { peopleById, personFor, type PersonSummary } from "@/lib/data/admin/shared";
import {
  toAcceptError,
  toCreateInvitationError,
  toPreviewStatus,
  type AcceptError,
  type CreateInvitationError,
  type PreviewStatus,
} from "@/lib/domain/invitations";

export type InvitationRow = {
  id: string;
  departmentId: string | null;
  departmentName: string | null;
  note: string | null;
  maxUses: number;
  useCount: number;
  expiresAt: string;
  createdAt: string;
  createdBy: PersonSummary;
  revokedAt: string | null;
};

/** Invitations the person may see (member.invite, per department), newest first. */
export async function listInvitations(): Promise<InvitationRow[]> {
  const supabase = await createSupabaseServerClient();
  const [invitations, departments] = await Promise.all([
    supabase
      .from("invitations")
      .select(
        "id, department_id, note, max_uses, use_count, expires_at, created_at, created_by, revoked_at",
      )
      .order("created_at", { ascending: false })
      .limit(100),
    supabase.from("departments").select("id, name"),
  ]);
  if (invitations.error) {
    throw new Error("Could not load invitations", { cause: invitations.error.code });
  }
  if (departments.error) {
    throw new Error("Could not load departments", { cause: departments.error.code });
  }
  const departmentName = new Map(departments.data.map((row) => [row.id, row.name]));
  const people = await peopleById(
    supabase,
    invitations.data.map((row) => row.created_by),
  );
  return invitations.data.map((row) => ({
    id: row.id,
    departmentId: row.department_id,
    departmentName: row.department_id ? (departmentName.get(row.department_id) ?? null) : null,
    note: row.note,
    maxUses: row.max_uses,
    useCount: row.use_count,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    createdBy: personFor(people, row.created_by),
    revokedAt: row.revoked_at,
  }));
}

export type CreateInvitationResult =
  { ok: true; token: string; expiresAt: string } | { ok: false; error: CreateInvitationError };

/** The token comes back once; only its hash is stored. */
export async function createInvitation(input: {
  departmentId: string | null;
  maxUses: number;
  validDays: number;
  note: string | null;
}): Promise<CreateInvitationResult> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("create_invitation", {
    p_department_id: input.departmentId,
    p_max_uses: input.maxUses,
    p_valid_days: input.validDays,
    p_note: input.note,
  });
  const row = data?.[0];
  if (error || !row) {
    return { ok: false, error: toCreateInvitationError(error?.message) };
  }
  return { ok: true, token: row.token, expiresAt: row.expires_at };
}

export async function revokeInvitation(invitationId: string): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("revoke_invitation", { p_invitation_id: invitationId });
  return !error;
}

export type InvitationPreview = {
  status: PreviewStatus;
  departmentName: string | null;
  departmentHue: string | null;
  departmentIcon: string | null;
  expiresAt: string | null;
};

export async function previewInvitation(token: string): Promise<InvitationPreview> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("invitation_preview", { p_token: token });
  const row = data?.[0];
  if (error || !row) {
    return {
      status: "not_found",
      departmentName: null,
      departmentHue: null,
      departmentIcon: null,
      expiresAt: null,
    };
  }
  return {
    status: toPreviewStatus(row.status),
    departmentName: row.department_name,
    departmentHue: row.department_hue,
    departmentIcon: row.department_icon,
    expiresAt: row.expires_at,
  };
}

export type AcceptInvitationResult = { ok: true } | { ok: false; error: AcceptError };

/** SRS-MEM-002. Idempotent in the database, so a retried tap is safe. */
export async function acceptInvitation(token: string): Promise<AcceptInvitationResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("accept_invitation", { p_token: token });
  return error ? { ok: false, error: toAcceptError(error.message) } : { ok: true };
}
