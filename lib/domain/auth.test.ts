import { describe, expect, it } from "vitest";
import {
  authConfirmParamsSchema,
  magicLinkRequestSchema,
  safeNextPath,
  signInErrorMessage,
} from "./auth";

describe("safeNextPath", () => {
  it.each([
    ["/home", "/home"],
    [
      "/departments/camera-operations?tab=levels#level-1",
      "/departments/camera-operations?tab=levels#level-1",
    ],
  ])("keeps same-site path %s", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });

  it.each([
    [null],
    [undefined],
    [""],
    ["home"],
    ["https://evil.example.com"],
    ["//evil.example.com"],
    ["/\\evil.example.com"],
    ["/\tevil"],
    ["javascript:alert(1)"],
  ])("falls back to /home for %s", (input) => {
    expect(safeNextPath(input)).toBe("/home");
  });
});

describe("magicLinkRequestSchema", () => {
  it("normalizes the address", () => {
    expect(magicLinkRequestSchema.parse({ email: "  Avery.Example@Example.COM " })).toEqual({
      email: "avery.example@example.com",
    });
  });

  it("rejects something that isn't an email address", () => {
    const result = magicLinkRequestSchema.safeParse({ email: "avery" });
    expect(result.success).toBe(false);
  });
});

describe("authConfirmParamsSchema", () => {
  it("accepts a token hash and a known type", () => {
    expect(authConfirmParamsSchema.safeParse({ token_hash: "abc", type: "email" }).success).toBe(
      true,
    );
  });

  it("rejects unknown types", () => {
    expect(authConfirmParamsSchema.safeParse({ token_hash: "abc", type: "sms" }).success).toBe(
      false,
    );
  });
});

describe("signInErrorMessage", () => {
  it("explains known errors in plain words", () => {
    expect(signInErrorMessage("link_invalid")).toMatch(/expired or was already used/);
  });

  it("ignores anything it doesn't recognize", () => {
    expect(signInErrorMessage("<script>")).toBeNull();
    expect(signInErrorMessage(null)).toBeNull();
  });
});
