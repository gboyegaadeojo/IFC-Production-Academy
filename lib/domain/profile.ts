import { z } from "zod";

/** SRS-AUTH-006: the only profile field people edit themselves for now. Matches the DB check. */
export const displayNameSchema = z
  .string()
  .transform((value) => value.replace(/\s+/g, " ").trim())
  .pipe(
    z
      .string()
      .min(1, "Enter the name you'd like people to see.")
      .max(120, "Keep your name under 120 characters."),
  );

const MEMBERSHIP_LABELS = {
  requested: "Request sent",
  active: "Member",
  declined: "Not approved",
  removed: "No longer a member",
} as const;

export function membershipLabel(status: keyof typeof MEMBERSHIP_LABELS): string {
  return MEMBERSHIP_LABELS[status];
}
