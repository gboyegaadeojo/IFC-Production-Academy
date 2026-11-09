import { describe, expect, it } from "vitest";
import { preferencesSchema, proposalItems, proposalSummary, type Proposal } from "./auto-schedule";

const ADA = "00000000-0000-4000-8000-000000000001";
const PLACE = "00000000-0000-4000-8000-000000000002";
const OTHER = "00000000-0000-4000-8000-000000000003";

const proposals: Proposal[] = [
  { positionId: PLACE, userId: ADA, name: "Ada", reason: "trained" },
  { positionId: OTHER, userId: null, name: null, reason: "No one on the team is free" },
];

describe("a proposal", () => {
  it("keeps only places with someone suggested", () => {
    expect(proposalItems(proposals)).toEqual([{ position_id: PLACE, user_id: ADA }]);
  });

  it("says how many were suggested and how many stay open", () => {
    expect(proposalSummary(proposals)).toBe("1 suggested, 1 still open.");
    expect(proposalSummary(proposals.slice(0, 1))).toBe("1 suggested.");
    expect(proposalSummary([])).toBe("Every place is already filled.");
  });
});

describe("scheduling preferences", () => {
  it("no limit and nobody to serve with", () => {
    expect(
      preferencesSchema.parse({
        maxPerMonth: "",
        householdMemberId: "",
        householdMode: "together",
      }),
    ).toEqual({ maxPerMonth: null, householdMemberId: null, householdMode: null });
  });

  it("a limit, and someone to serve with", () => {
    expect(
      preferencesSchema.parse({ maxPerMonth: "2", householdMemberId: ADA, householdMode: "apart" }),
    ).toEqual({ maxPerMonth: 2, householdMemberId: ADA, householdMode: "apart" });
  });

  it("at most eight a month", () => {
    expect(
      preferencesSchema.safeParse({
        maxPerMonth: "9",
        householdMemberId: "",
        householdMode: "together",
      }).success,
    ).toBe(false);
  });
});
