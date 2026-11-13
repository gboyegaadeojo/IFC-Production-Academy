import { describe, expect, it } from "vitest";
import {
  adjustedShade,
  COLOUR_PRESETS,
  colourCss,
  contrast,
  customColour,
  DARK_SURFACES,
  emailAccent,
  LIGHT_SURFACES,
  normaliseColour,
  parseHex,
  PRESETS,
  READABLE,
  resolveColour,
  type SystemColour,
} from "./system-colour";

function expectReadable(colour: SystemColour) {
  expect(contrast(colour.light.accent, "#ffffff")).toBeGreaterThanOrEqual(READABLE);
  expect(contrast(colour.dark.accent, "#ffffff")).toBeGreaterThanOrEqual(READABLE);
  for (const surface of LIGHT_SURFACES) {
    expect(contrast(colour.light.accentLight, surface)).toBeGreaterThanOrEqual(READABLE);
  }
  for (const surface of DARK_SURFACES) {
    expect(contrast(colour.dark.accentLight, surface)).toBeGreaterThanOrEqual(READABLE);
  }
}

describe("presets", () => {
  it.each(COLOUR_PRESETS)("%s keeps white on buttons and text on pages readable", (name) => {
    expectReadable(PRESETS[name]);
  });

  it("keeps purple exactly as the stylesheet has it", () => {
    expect(PRESETS.purple.light.accent).toBe("#6d3fe0");
    expect(PRESETS.purple.dark.accentLight).toBe("#b69bff");
  });
});

describe("custom colours", () => {
  it.each(["#f59e0b", "#facc15", "#22d3ee", "#ffffff", "#000000", "#7c3aed", "#ef4444"])(
    "%s is adjusted until everything reads",
    (hex) => {
      expectReadable(customColour(hex));
    },
  );

  it("deepens a light colour and says which shade it uses", () => {
    const shade = adjustedShade("#f59e0b");
    expect(shade).not.toBeNull();
    expect(contrast(shade ?? "", "#ffffff")).toBeGreaterThanOrEqual(READABLE);
  });

  it("leaves a dark enough colour as it is", () => {
    expect(adjustedShade("#1d4ed8")).toBeNull();
  });
});

describe("saved values", () => {
  it("accepts a preset name or a hex, and anything else is purple", () => {
    expect(normaliseColour("Teal ")).toBe("teal");
    expect(normaliseColour("#F59E0B")).toBe("#f59e0b");
    expect(normaliseColour("red; background: url(x)")).toBe("purple");
    expect(normaliseColour(null)).toBe("purple");
  });

  it("reads what people type", () => {
    expect(parseHex("f59e0b")).toBe("#f59e0b");
    expect(parseHex("#FA0")).toBe("#ffaa00");
    expect(parseHex("orange")).toBeNull();
  });

  it("colours email buttons for white", () => {
    expect(emailAccent("purple")).toBe("#6d3fe0");
    expect(emailAccent("blue")).toBe("#2563eb");
  });

  it("gives the same colours however it was saved", () => {
    expect(resolveColour(" BLUE")).toEqual(PRESETS.blue);
  });
});

describe("colourCss", () => {
  it("adds nothing for purple, the stylesheet's own", () => {
    expect(colourCss("purple", true)).toBe("");
  });

  it("sets both themes, and the logo only when it follows", () => {
    const css = colourCss("teal", true);
    expect(css).toContain(":root:root{--accent:#0f766e;");
    expect(css).toContain(":root[data-theme=light]{--accent:#0f766e;");
    expect(css).toContain("--logo-accent:");
    expect(colourCss("teal", false)).not.toContain("--logo-accent");
  });

  it("can't carry anything but colours into the page", () => {
    expect(colourCss("</style><script>", true)).toBe("");
  });
});
