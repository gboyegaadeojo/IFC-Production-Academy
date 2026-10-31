import { describe, expect, it } from "vitest";
import {
  competencySchema,
  competencyState,
  missingLabel,
  roleReadiness,
  toCompetencyError,
  type CompetencyRecord,
} from "./competency";

const now = new Date("2026-11-01T12:00:00Z");
const record = (
  competencyId: string,
  overrides: Partial<CompetencyRecord> = {},
): CompetencyRecord => ({
  id: `r-${competencyId}`,
  competencyId,
  status: "approved",
  grantedAt: "2026-10-01T00:00:00Z",
  expiresAt: null,
  suspendReason: null,
  ...overrides,
});

describe("competencyState", () => {
  it("reads not assessed, approved, suspended, and expired", () => {
    expect(competencyState(undefined, now)).toBe("not_assessed");
    expect(competencyState(record("a"), now)).toBe("approved");
    expect(
      competencyState(
        record("a", { status: "suspended", suspendReason: "Missed safety step" }),
        now,
      ),
    ).toBe("suspended");
    expect(competencyState(record("a", { expiresAt: "2026-11-01T12:00:00Z" }), now)).toBe(
      "expired",
    );
    expect(competencyState(record("a", { expiresAt: "2027-01-01T00:00:00Z" }), now)).toBe(
      "approved",
    );
  });
});

describe("roleReadiness", () => {
  const required = [
    { id: "a", name: "Framing" },
    { id: "b", name: "Camera presets" },
  ];

  it("is approved only with the stored approval and every competency current", () => {
    const records = new Map([
      ["a", record("a")],
      ["b", record("b")],
    ]);
    expect(roleReadiness(required, records, { status: "approved" }, now).approved).toBe(true);
    expect(roleReadiness(required, records, undefined, now).approved).toBe(false);
  });

  it("lists what's missing, and treats an expired competency as missing", () => {
    const records = new Map([["a", record("a", { expiresAt: "2026-10-31T00:00:00Z" })]]);
    const readiness = roleReadiness(required, records, { status: "approved" }, now);
    expect(readiness.approved).toBe(false);
    expect(readiness.missing).toEqual(["Framing", "Camera presets"]);
    expect(missingLabel(readiness.missing)).toBe("Needs Framing and Camera presets");
  });

  it("never approves a role with no requirements", () => {
    const readiness = roleReadiness([], new Map(), { status: "approved" }, now);
    expect(readiness.approved).toBe(false);
    expect(readiness.unconfigured).toBe(true);
  });
});

describe("missingLabel", () => {
  it("joins names in plain English", () => {
    expect(missingLabel([])).toBe("");
    expect(missingLabel(["Framing"])).toBe("Needs Framing");
    expect(missingLabel(["A", "B", "C"])).toBe("Needs A, B and C");
  });
});

describe("competencySchema", () => {
  it("is off by default and allows the offered expiry periods", () => {
    expect(
      competencySchema.parse({ name: " Framing ", description: "", expiryMonths: "never" }),
    ).toEqual({ name: "Framing", description: "", expiryMonths: null });
    expect(
      competencySchema.parse({ name: "A", description: "", expiryMonths: "12" }).expiryMonths,
    ).toBe(12);
    expect(
      competencySchema.safeParse({ name: "A", description: "", expiryMonths: "5" }).success,
    ).toBe(false);
  });
});

describe("toCompetencyError", () => {
  it("maps database errors", () => {
    expect(toCompetencyError({ code: "23505", message: "duplicate key" })).toBe("duplicate_name");
    expect(toCompetencyError({ message: "reason_required" })).toBe("reason_required");
    expect(toCompetencyError({ code: "42501", message: "x" })).toBe("not_authorized");
    expect(toCompetencyError({ code: "XX000", message: "secret" })).toBe("unknown");
  });
});
