import { describe, expect, it } from "vitest";
import {
  browsableDepartments,
  currentMembershipByDepartment,
  departmentCardState,
  departmentHueVar,
  requestMembershipErrorMessage,
  toRequestMembershipError,
  type Membership,
} from "./departments";

const open = { status: "active", enrolmentMode: "request" } as const;

describe("departmentCardState", () => {
  it("offers a request when there is no membership", () => {
    expect(departmentCardState(open, null)).toEqual({ kind: "can_request", previously: null });
  });

  it("shows a pending request", () => {
    expect(departmentCardState(open, { status: "requested" })).toEqual({ kind: "requested" });
  });

  it("shows membership, which is not approval to serve", () => {
    expect(departmentCardState(open, { status: "active" })).toEqual({ kind: "member" });
  });

  it("offers another request after a decline or removal", () => {
    expect(departmentCardState(open, { status: "declined" })).toEqual({
      kind: "can_request",
      previously: "declined",
    });
    expect(departmentCardState(open, { status: "removed" })).toEqual({
      kind: "can_request",
      previously: "removed",
    });
  });

  it("never offers a request for a Coming Soon department", () => {
    const comingSoon = { status: "coming_soon", enrolmentMode: "request" } as const;
    expect(departmentCardState(comingSoon, null)).toEqual({ kind: "coming_soon" });
    expect(departmentCardState(comingSoon, { status: "requested" })).toEqual({
      kind: "coming_soon",
    });
  });

  it("respects invite-only departments", () => {
    expect(departmentCardState({ status: "active", enrolmentMode: "invite_only" }, null)).toEqual({
      kind: "invite_only",
    });
  });

  it("hides inactive departments", () => {
    expect(departmentCardState({ status: "inactive", enrolmentMode: "request" }, null)).toEqual({
      kind: "unavailable",
    });
  });
});

describe("currentMembershipByDepartment", () => {
  const row = (
    id: string,
    departmentId: string,
    status: Membership["status"],
    updatedAt: string,
  ): Membership => ({ id, departmentId, status, updatedAt });

  it("prefers an open membership over a newer closed one", () => {
    const result = currentMembershipByDepartment([
      row("1", "d1", "requested", "2026-10-01T00:00:00Z"),
      row("2", "d1", "declined", "2026-10-02T00:00:00Z"),
    ]);
    expect(result.get("d1")?.id).toBe("1");
  });

  it("keeps the most recent closed membership when none is open", () => {
    const result = currentMembershipByDepartment([
      row("1", "d1", "declined", "2026-10-01T00:00:00Z"),
      row("2", "d1", "removed", "2026-10-03T00:00:00Z"),
    ]);
    expect(result.get("d1")?.id).toBe("2");
  });

  it("keeps departments separate", () => {
    const result = currentMembershipByDepartment([
      row("1", "d1", "active", "2026-10-01T00:00:00Z"),
      row("2", "d2", "requested", "2026-10-01T00:00:00Z"),
    ]);
    expect(result.size).toBe(2);
  });
});

describe("browsableDepartments", () => {
  it("drops inactive departments and keeps the configured order", () => {
    const result = browsableDepartments([
      { name: "B", status: "active", sortOrder: 20 },
      { name: "Hidden", status: "inactive", sortOrder: 5 },
      { name: "A", status: "coming_soon", sortOrder: 10 },
    ] as const);
    expect(result.map((department) => department.name)).toEqual(["A", "B"]);
  });
});

describe("departmentHueVar", () => {
  it("maps known hues to tokens and falls back for unknown ones", () => {
    expect(departmentHueVar("teal")).toBe("var(--dept-teal)");
    expect(departmentHueVar("red;background:url(x)")).toBe("var(--accent-light)");
  });
});

describe("request membership errors", () => {
  it("maps database messages to known errors", () => {
    expect(toRequestMembershipError("department_not_open")).toBe("department_not_open");
    expect(toRequestMembershipError("duplicate key value")).toBe("unknown");
    expect(toRequestMembershipError(undefined)).toBe("unknown");
  });

  it("has a plain-language message for every error", () => {
    expect(requestMembershipErrorMessage("department_not_open")).toBe(
      "This department isn't taking requests yet.",
    );
  });
});
