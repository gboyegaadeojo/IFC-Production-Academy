import { describe, expect, it } from "vitest";
import { colorScheme, initialTheme, parseAppearance } from "./appearance";

describe("appearance", () => {
  it("defaults to dark for anything it doesn't know", () => {
    expect(parseAppearance(undefined)).toBe("dark");
    expect(parseAppearance("")).toBe("dark");
    expect(parseAppearance("sepia")).toBe("dark");
    expect(parseAppearance("light")).toBe("light");
    expect(parseAppearance("system")).toBe("system");
  });

  it("renders System dark until the browser knows better", () => {
    expect(initialTheme("system")).toBe("dark");
    expect(initialTheme("light")).toBe("light");
    expect(colorScheme("system")).toBe("dark light");
    expect(colorScheme("light")).toBe("light");
  });
});
