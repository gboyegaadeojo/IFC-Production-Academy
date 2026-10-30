import { describe, expect, it } from "vitest";
import { hasCapability, hasCapabilityAnywhere, type CapabilityGrant } from "./capabilities";

const CAMERA = "b7ba9dae-cab5-43e0-a996-8ae9d2436855";
const AUDIO = "8cd57d7d-1aab-4be6-b67b-e9bc606e0d73";

describe("hasCapability", () => {
  const cameraLeader: CapabilityGrant[] = [{ capability: "member.approve", departmentId: CAMERA }];
  const director: CapabilityGrant[] = [{ capability: "member.approve", departmentId: null }];

  it("allows a department grant in that department", () => {
    expect(hasCapability(cameraLeader, "member.approve", CAMERA)).toBe(true);
  });

  it("denies a department grant in another department", () => {
    expect(hasCapability(cameraLeader, "member.approve", AUDIO)).toBe(false);
  });

  it("denies a department grant when the check is organization-wide", () => {
    expect(hasCapability(cameraLeader, "member.approve")).toBe(false);
  });

  it("allows an organization-wide grant everywhere", () => {
    expect(hasCapability(director, "member.approve", AUDIO)).toBe(true);
    expect(hasCapability(director, "member.approve")).toBe(true);
  });

  it("denies capabilities that were never granted", () => {
    expect(hasCapability(director, "course.publish", CAMERA)).toBe(false);
    expect(hasCapability([], "member.approve", CAMERA)).toBe(false);
  });
});

describe("hasCapabilityAnywhere", () => {
  it("finds a capability held in any department", () => {
    expect(
      hasCapabilityAnywhere(
        [{ capability: "member.approve", departmentId: CAMERA }],
        "member.approve",
      ),
    ).toBe(true);
    expect(hasCapabilityAnywhere([], "member.approve")).toBe(false);
  });
});
