import { describe, expect, it } from "vitest";
import { featureFlagsFrom, isFeatureKey } from "./features";

describe("feature flags", () => {
  it("knows only the listed features", () => {
    expect(isFeatureKey("messaging")).toBe(true);
    expect(isFeatureKey("copyright")).toBe(true);
    expect(isFeatureKey("Messaging")).toBe(false);
    expect(isFeatureKey(undefined)).toBe(false);
  });

  it("is off unless a row says it's on", () => {
    expect(featureFlagsFrom([])).toEqual({ messaging: false, copyright: false });
    expect(featureFlagsFrom([{ key: "messaging", enabled: true }])).toEqual({
      messaging: true,
      copyright: false,
    });
  });

  it("ignores rows it doesn't know", () => {
    expect(featureFlagsFrom([{ key: "something_else", enabled: true }])).toEqual({
      messaging: false,
      copyright: false,
    });
  });
});
