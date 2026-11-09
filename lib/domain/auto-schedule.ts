/**
 * Auto-schedule and scheduling preferences (plan "Academy scheduling", PR 8). The database picks
 * the suggestions (propose_schedule) with the same rules as the Academy's other picks; these
 * check what the forms send and summarise a proposal.
 */
import { z } from "zod";

export type Proposal = {
  positionId: string;
  /** Null when nobody on the team is free. */
  userId: string | null;
  name: string | null;
  reason: string;
};

export const proposalItemsSchema = z
  .array(z.object({ position_id: z.uuid(), user_id: z.uuid() }))
  .min(1, "There's nobody to add.")
  .max(200);

/** What the scheduler keeps: only places with someone suggested. */
export function proposalItems(proposals: readonly Proposal[]) {
  return proposals.flatMap((proposal) =>
    proposal.userId ? [{ position_id: proposal.positionId, user_id: proposal.userId }] : [],
  );
}

/** "4 suggested, 1 still open." */
export function proposalSummary(proposals: readonly Proposal[]): string {
  const suggested = proposals.filter((proposal) => proposal.userId).length;
  const open = proposals.length - suggested;
  if (proposals.length === 0) {
    return "Every place is already filled.";
  }
  return `${suggested} suggested${open > 0 ? `, ${open} still open` : ""}.`;
}

export const HOUSEHOLD_MODES = ["together", "apart"] as const;
export type HouseholdMode = (typeof HOUSEHOLD_MODES)[number];

export const HOUSEHOLD_MODE_LABELS: Record<HouseholdMode, string> = {
  together: "The same services when possible",
  apart: "Never the same service",
};

export type SchedulingPreferences = {
  maxPerMonth: number | null;
  householdMemberId: string | null;
  householdMode: HouseholdMode | null;
};

/** The preferences form: "" means no limit, or nobody. */
export const preferencesSchema = z
  .object({
    maxPerMonth: z.union([z.literal(""), z.coerce.number().int().min(1).max(8)]),
    householdMemberId: z.union([z.literal(""), z.uuid()]),
    householdMode: z.enum(HOUSEHOLD_MODES),
  })
  .transform((value): SchedulingPreferences => ({
    maxPerMonth: value.maxPerMonth === "" ? null : value.maxPerMonth,
    householdMemberId: value.householdMemberId === "" ? null : value.householdMemberId,
    householdMode: value.householdMemberId === "" ? null : value.householdMode,
  }));
