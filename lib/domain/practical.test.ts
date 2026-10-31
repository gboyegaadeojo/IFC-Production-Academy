import { describe, expect, it } from "vitest";
import {
  DEFAULT_PASS_RULE,
  nextAssessmentAt,
  passRuleLabel,
  practicalOutcome,
  practicalSettingsSchema,
  practicalState,
  toPracticalError,
} from "./practical";

const criteria = [
  { id: "a", isRequired: true },
  { id: "b", isRequired: true },
  { id: "c", isRequired: false },
  { id: "d", isRequired: false },
  { id: "e", isRequired: false },
];

describe("practicalOutcome", () => {
  it("passes with every required item and at least 80% of all", () => {
    expect(practicalOutcome(criteria, new Set(["a", "b", "c", "d"]), DEFAULT_PASS_RULE)).toBe(
      "pass",
    );
  });

  it("needs every required item", () => {
    expect(practicalOutcome(criteria, new Set(["a", "c", "d", "e"]), DEFAULT_PASS_RULE)).toBe(
      "further_practice",
    );
  });

  it("needs the share of all items too", () => {
    expect(practicalOutcome(criteria, new Set(["a", "b", "c"]), DEFAULT_PASS_RULE)).toBe(
      "further_practice",
    );
  });

  it("follows the leader's rule", () => {
    const relaxed = { requireAllRequired: false, passMinPercent: 60 };
    expect(practicalOutcome(criteria, new Set(["c", "d", "e"]), relaxed)).toBe("pass");
    expect(practicalOutcome([], new Set(), relaxed)).toBe("further_practice");
  });
});

describe("passRuleLabel", () => {
  it("states the rule plainly", () => {
    expect(passRuleLabel(DEFAULT_PASS_RULE)).toBe(
      "To pass: every required item, and at least 80% of all items",
    );
    expect(passRuleLabel({ requireAllRequired: true, passMinPercent: 0 })).toBe(
      "To pass: every required item",
    );
    expect(passRuleLabel({ requireAllRequired: false, passMinPercent: 100 })).toBe(
      "To pass: every item",
    );
  });
});

describe("practicalState", () => {
  const assessment = (outcome: "pass" | "further_practice", day: number, voided = false) => ({
    id: `${outcome}-${day}`,
    outcome,
    assessedAt: `2026-10-${String(day).padStart(2, "0")}T10:00:00Z`,
    voidedAt: voided ? "2026-10-31T00:00:00Z" : null,
  });

  it("moves from not assessed to requested, further practice, and passed", () => {
    expect(practicalState([], false)).toBe("not_assessed");
    expect(practicalState([], true)).toBe("requested");
    expect(practicalState([assessment("further_practice", 1)], false)).toBe("further_practice");
    expect(practicalState([assessment("further_practice", 1)], true)).toBe("requested");
    expect(practicalState([assessment("further_practice", 1), assessment("pass", 2)], false)).toBe(
      "passed",
    );
  });

  it("ignores voided assessments", () => {
    expect(practicalState([assessment("pass", 2, true)], false)).toBe("not_assessed");
  });
});

describe("nextAssessmentAt", () => {
  it("adds the waiting days, or allows any time", () => {
    expect(nextAssessmentAt("2026-10-01T10:00:00Z", 7)?.toISOString()).toBe(
      "2026-10-08T10:00:00.000Z",
    );
    expect(nextAssessmentAt("2026-10-01T10:00:00Z", 0)).toBeNull();
    expect(nextAssessmentAt(null, 7)).toBeNull();
  });
});

describe("practicalSettingsSchema", () => {
  it("reads the competency and rule", () => {
    const parsed = practicalSettingsSchema.parse({
      title: "Camera check",
      intro: "",
      placement: "end",
      competencyId: "none",
      isRequired: true,
      requireAllRequired: true,
      passMinPercent: "80",
      retryWaitDays: "0",
    });
    expect(parsed.competencyId).toBeNull();
    expect(parsed.passMinPercent).toBe(80);
  });
});

describe("toPracticalError", () => {
  it("maps database errors", () => {
    expect(toPracticalError({ message: "already_passed" })).toBe("already_passed");
    expect(toPracticalError({ code: "42501", message: "cannot_assess_self" })).toBe(
      "cannot_assess_self",
    );
    expect(toPracticalError({ code: "XX000", message: "secret" })).toBe("unknown");
  });
});
