/**
 * Invitations (SRS-AUTH-003, SRS-MEM-002, ADD-AUTH-01). Pure rules and wording; the database
 * creates tokens, checks permissions, and decides acceptance.
 */
import { z } from "zod";

/** 24 random bytes as URL-safe base64, as create_invitation() makes them. */
export const invitationTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{32}$/);

export function isInvitationToken(value: unknown): value is string {
  return invitationTokenSchema.safeParse(value).success;
}

export const PENDING_INVITE_COOKIE = "pending_invite";

export const VALID_DAY_OPTIONS = [7, 14, 30] as const;
export const MAX_GROUP_SIZE = 200;

export const createInvitationSchema = z
  .object({
    // "" means an Academy-only invitation, without a department.
    departmentId: z.union([z.uuid(), z.literal("")]).transform((value) => value || null),
    audience: z.enum(["one", "group"]),
    groupSize: z.preprocess(
      (value) => (value === "" || value === null ? undefined : value),
      z.coerce
        .number()
        .int()
        .min(2, `For a group, enter 2 to ${MAX_GROUP_SIZE} people.`)
        .max(MAX_GROUP_SIZE, `For a group, enter 2 to ${MAX_GROUP_SIZE} people.`)
        .optional(),
    ),
    validDays: z.coerce
      .number()
      .refine((value) => (VALID_DAY_OPTIONS as readonly number[]).includes(value)),
    note: z
      .string()
      .trim()
      .max(120, "Keep the note under 120 characters.")
      .transform((value) => (value === "" ? null : value)),
  })
  .refine((value) => value.audience === "one" || value.groupSize !== undefined, {
    message: `For a group, enter how many people can use it (2 to ${MAX_GROUP_SIZE}).`,
    path: ["groupSize"],
  });

export function maxUsesFor(input: { audience: "one" | "group"; groupSize?: number }): number {
  return input.audience === "one" ? 1 : (input.groupSize ?? 2);
}

export type InvitationState = "active" | "expired" | "used_up" | "revoked";

/** How an invitation reads in a leader's list. */
export function invitationState(
  invitation: { revokedAt: string | null; expiresAt: string; useCount: number; maxUses: number },
  now: Date = new Date(),
): InvitationState {
  if (invitation.revokedAt) {
    return "revoked";
  }
  if (Date.parse(invitation.expiresAt) <= now.getTime()) {
    return "expired";
  }
  if (invitation.useCount >= invitation.maxUses) {
    return "used_up";
  }
  return "active";
}

export const INVITATION_STATE_LABELS: Record<InvitationState, string> = {
  active: "Active",
  expired: "Expired",
  used_up: "All places used",
  revoked: "Revoked",
};

export type PreviewStatus =
  "valid" | "accepted" | "already_member" | "expired" | "used_up" | "revoked" | "not_found";

const PREVIEW_STATUSES: ReadonlySet<string> = new Set<PreviewStatus>([
  "valid",
  "accepted",
  "already_member",
  "expired",
  "used_up",
  "revoked",
  "not_found",
]);

export function toPreviewStatus(value: string | null | undefined): PreviewStatus {
  return value && PREVIEW_STATUSES.has(value) ? (value as PreviewStatus) : "not_found";
}

/** What a volunteer reads when an invitation can't be used. Never blames them. */
export function unusableInvitationMessage(
  status: Exclude<PreviewStatus, "valid" | "accepted" | "already_member">,
): string {
  switch (status) {
    case "expired":
      return "This invitation has expired. Ask the leader who sent it for a new one.";
    case "used_up":
      return "Everyone this invitation was meant for has already joined. Ask the leader for a new one.";
    case "revoked":
      return "This invitation is no longer active. Ask the leader who sent it for a new one.";
    case "not_found":
      return "We couldn't find this invitation. Check the link, or ask the leader to send it again.";
  }
}

export type AcceptError =
  | "invitation_not_found"
  | "invitation_revoked"
  | "invitation_expired"
  | "invitation_used_up"
  | "not_authorized"
  | "unknown";

const ACCEPT_ERRORS: ReadonlySet<string> = new Set<AcceptError>([
  "invitation_not_found",
  "invitation_revoked",
  "invitation_expired",
  "invitation_used_up",
  "not_authorized",
]);

export function toAcceptError(message: string | null | undefined): AcceptError {
  return message && ACCEPT_ERRORS.has(message) ? (message as AcceptError) : "unknown";
}

export function acceptErrorMessage(error: AcceptError): string {
  switch (error) {
    case "invitation_not_found":
      return unusableInvitationMessage("not_found");
    case "invitation_revoked":
      return unusableInvitationMessage("revoked");
    case "invitation_expired":
      return unusableInvitationMessage("expired");
    case "invitation_used_up":
      return unusableInvitationMessage("used_up");
    case "not_authorized":
      return "Your account can't accept invitations right now. Talk to your department leader.";
    case "unknown":
      return "That didn't go through. Check your connection and try again.";
  }
}

export type CreateInvitationError =
  "not_authorized" | "department_not_open" | "invalid_invitation_settings" | "unknown";

const CREATE_ERRORS: ReadonlySet<string> = new Set<CreateInvitationError>([
  "not_authorized",
  "department_not_open",
  "invalid_invitation_settings",
]);

export function toCreateInvitationError(message: string | null | undefined): CreateInvitationError {
  return message && CREATE_ERRORS.has(message) ? (message as CreateInvitationError) : "unknown";
}

export function createInvitationErrorMessage(error: CreateInvitationError): string {
  switch (error) {
    case "not_authorized":
      return "You can't invite people to that department. Ask the Production Director if you should.";
    case "department_not_open":
      return "That department isn't open yet, so it can't take invitations.";
    case "invalid_invitation_settings":
      return "Check the number of people and how long the link lasts, then try again.";
    case "unknown":
      return "The invitation wasn't created. Check your connection and try again.";
  }
}

/** The link volunteers open. */
export function invitationUrl(siteUrl: string, token: string): string {
  return new URL(`/invite/${token}`, siteUrl).toString();
}
