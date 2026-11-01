import { describe, expect, it } from "vitest";
import { colorScheme, initialTheme, parseAppearance } from "./appearance";

describe("appearance", () => {
  it("defaults to light for anything it doesn't know", () => {
    expect(parseAppearance(undefined)).toBe("light");
    expect(parseAppearance("")).toBe("light");
    expect(parseAppearance("sepia")).toBe("light");
    expect(parseAppearance("dark")).toBe("dark");
    expect(parseAppearance("system")).toBe("system");
  });

  it("renders System light until the browser knows better", () => {
    expect(initialTheme("system")).toBe("light");
    expect(initialTheme("dark")).toBe("dark");
    expect(colorScheme("system")).toBe("light dark");
    expect(colorScheme("dark")).toBe("dark");
  });
});
