import { describe, expect, it } from "vitest";
import { firstName, initials } from "./people";

describe("firstName", () => {
  it("takes the first word", () => {
    expect(firstName("  Sam   Example ")).toBe("Sam");
    expect(firstName("gadeojo")).toBe("gadeojo");
  });

  it("keeps an empty name empty", () => {
    expect(firstName("   ")).toBe("");
  });
});

describe("initials", () => {
  it("takes the first letters of the first and last words", () => {
    expect(initials("Avery Example")).toBe("AE");
    expect(initials("Mary Ann van Dyke")).toBe("MD");
  });

  it("handles single names and email-style names", () => {
    expect(initials("gadeojo")).toBe("G");
    expect(initials("e2e-desktop-123")).toBe("E1");
    expect(initials("first.last")).toBe("FL");
  });

  it("handles accents and empty names", () => {
    expect(initials("élodie ñúñez")).toBe("ÉÑ");
    expect(initials("   ")).toBe("?");
  });
});
