import { describe, expect, it } from "vitest";
import { parseAppearance } from "./appearance";

describe("appearance", () => {
  it("defaults to light for anything it doesn't know", () => {
    expect(parseAppearance(undefined)).toBe("light");
    expect(parseAppearance("")).toBe("light");
    expect(parseAppearance("sepia")).toBe("light");
    expect(parseAppearance("dark")).toBe("dark");
  });

  it("starts a device that had the old System choice in light", () => {
    expect(parseAppearance("system")).toBe("light");
  });
});
