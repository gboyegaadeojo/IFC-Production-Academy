/**
 * Competencies and Approved to Serve (SRS-COMP-001..004, -009). Pure rules for showing where
 * someone stands. The database grants, withdraws, and stores every record; these functions only
 * read them, and treat an expired record as not current even before the stored approval catches up.
 */
import { z } from "zod";

export type CompetencyRecord = {
  id: string;
  competencyId: string;
  status: "approved" | "suspended";
  grantedAt: string;
  expiresAt: string | null;
  suspendReason: string | null;
};

export type CompetencyState = "not_assessed" | "approved" | "suspended" | "expired";

export function competencyState(record: CompetencyRecord | undefined, now: Date): CompetencyState {
  if (!record) {
    return "not_assessed";
  }
  if (record.status === "suspended") {
    return "suspended";
  }
  if (record.expiresAt !== null && new Date(record.expiresAt).getTime() <= now.getTime()) {
    return "expired";
  }
  return "approved";
}

export const COMPETENCY_STATE_LABELS: Record<CompetencyState, string> = {
  not_assessed: "Not assessed yet",
  approved: "Approved",
  suspended: "Suspended",
  expired: "Expired",
};

export type RoleReadiness = {
  /** Approved to Serve right now: the stored approval, and every competency still current. */
  approved: boolean;
  /** Names of required competencies that aren't current, in the role's order. */
  missing: string[];
  /** The role needs no competencies yet, so nobody can be approved for it. */
  unconfigured: boolean;
};

export function roleReadiness(
  required: readonly { id: string; name: string }[],
  records: ReadonlyMap<string, CompetencyRecord>,
  storedApproval: { status: "approved" | "withdrawn" } | undefined,
  now: Date,
): RoleReadiness {
  const missing = required
    .filter((competency) => competencyState(records.get(competency.id), now) !== "approved")
    .map((competency) => competency.name);
  return {
    approved: required.length > 0 && missing.length === 0 && storedApproval?.status === "approved",
    missing,
    unconfigured: required.length === 0,
  };
}

/** "Needs Camera presets and Framing", for a role someone isn't approved for yet. */
export function missingLabel(missing: readonly string[]): string {
  if (missing.length === 0) {
    return "";
  }
  if (missing.length === 1) {
    return `Needs ${missing[0]}`;
  }
  return `Needs ${missing.slice(0, -1).join(", ")} and ${missing.at(-1)}`;
}

export const EXPIRY_CHOICES = [null, 6, 12, 24, 36] as const;

export function expiryLabel(months: number | null): string {
  return months === null ? "Never expires" : `Expires after ${months} months`;
}

const nameField = z
  .string()
  .transform((value) => value.replace(/\s+/g, " ").trim())
  .pipe(z.string().min(1, "Give it a name.").max(80, "Keep the name under 80 characters."));

export const competencySchema = z.object({
  name: nameField,
  description: z.string().trim().max(500, "Keep the description under 500 characters."),
  expiryMonths: z.union([
    z.literal("never").transform(() => null),
    z.coerce
      .number()
      .int()
      .refine((value) => [6, 12, 24, 36].includes(value), "Choose when it expires."),
  ]),
});

export const servingRoleSchema = z.object({
  name: nameField,
  description: z.string().trim().max(500, "Keep the description under 500 characters."),
});

export const suspendReasonSchema = z
  .string()
  .trim()
  .min(1, "Say why, so the volunteer and other leaders understand.")
  .max(300, "Keep the reason under 300 characters.");

export type CompetencyError =
  | "not_authorized"
  | "reason_required"
  | "competency_not_in_department"
  | "duplicate_name"
  | "unknown";

export function toCompetencyError(
  error: { code?: string | null; message?: string | null } | null | undefined,
): CompetencyError {
  if (error?.code === "23505") {
    return "duplicate_name";
  }
  if (
    error?.message === "reason_required" ||
    error?.message === "competency_not_in_department" ||
    error?.message === "not_authorized"
  ) {
    return error.message;
  }
  if (error?.code === "42501") {
    return "not_authorized";
  }
  return "unknown";
}

export function competencyErrorMessage(error: CompetencyError): string {
  switch (error) {
    case "not_authorized":
      return "Only leaders of this department can change its competencies and roles.";
    case "reason_required":
      return "Say why, so the volunteer and other leaders understand.";
    case "competency_not_in_department":
      return "A role can only need competencies from its own department.";
    case "duplicate_name":
      return "There's already one with that name in this department.";
    case "unknown":
      return "That didn't save. Check your connection and try again.";
  }
}
