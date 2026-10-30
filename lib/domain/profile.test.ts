import { describe, expect, it } from "vitest";
import { displayNameSchema, membershipLabel } from "./profile";

describe("displayNameSchema", () => {
  it("trims and collapses spaces", () => {
    expect(displayNameSchema.parse("  Sam   Example ")).toBe("Sam Example");
  });

  it("rejects an empty name with a plain message", () => {
    const result = displayNameSchema.safeParse("   ");
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Enter the name you'd like people to see.");
  });

  it("rejects names over 120 characters", () => {
    expect(displayNameSchema.safeParse("a".repeat(121)).success).toBe(false);
    expect(displayNameSchema.safeParse("a".repeat(120)).success).toBe(true);
  });
});

describe("membershipLabel", () => {
  it("never calls a member approved to serve", () => {
    expect(membershipLabel("active")).toBe("Member");
    expect(membershipLabel("active")).not.toMatch(/serve/i);
  });
});
