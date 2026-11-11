import { describe, expect, it } from "vitest";
import {
  brandIconUrl,
  brandingSchema,
  DEFAULT_BRANDING,
  iconInitials,
  isSquarePng,
  manifestIcons,
  markColoursOn,
  usesBuiltInLogo,
  wordmarkParts,
} from "./branding";

describe("markColoursOn", () => {
  it("follows the brand's colour rules, with the dot as the only accent", () => {
    expect(markColoursOn("#ffffff")).toEqual({ line: "#000000", dot: "#7c3aed" });
    expect(markColoursOn("#000000")).toEqual({ line: "#f5f5f5", dot: "#b69bff" });
    expect(markColoursOn("#7C3AED")).toEqual({ line: "#f5f5f5", dot: "#f5f5f5" });
    expect(markColoursOn("#1f5fd1")).toEqual({ line: "#f5f5f5", dot: "#f5f5f5" });
  });
});

describe("usesBuiltInLogo", () => {
  it("shows Signal Line when nothing is chosen in Admin, Branding", () => {
    expect(usesBuiltInLogo({ name: DEFAULT_BRANDING.name, iconUrl: null })).toBe(true);
  });

  it("gives way to an uploaded logo", () => {
    expect(usesBuiltInLogo({ name: DEFAULT_BRANDING.name, iconUrl: "https://x/icon.png" })).toBe(
      false,
    );
  });

  it("gives way to a new name, which the built-in wordmark can't spell", () => {
    expect(usesBuiltInLogo({ name: "Booth Crew", iconUrl: null })).toBe(false);
  });
});

/** A PNG's signature and header, enough to read its size. */
function pngHeader(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

describe("brandingSchema", () => {
  it("tidies and accepts good names", () => {
    expect(brandingSchema.parse({ name: "  Team App ", shortName: " Team " })).toEqual({
      name: "Team App",
      shortName: "Team",
    });
  });

  it.each([
    ["an empty name", { name: "  ", shortName: "Team" }],
    ["an empty short name", { name: "Team", shortName: "" }],
    ["a long name", { name: "x".repeat(41), shortName: "Team" }],
    ["a long short name", { name: "Team", shortName: "x".repeat(25) }],
  ])("refuses %s", (_, input) => {
    expect(brandingSchema.safeParse(input).success).toBe(false);
  });
});

describe("iconInitials", () => {
  it("takes up to three initials", () => {
    expect(iconInitials("IFC Academy")).toBe("IA");
    expect(iconInitials("one two three four")).toBe("OTT");
  });

  it("always has something to draw", () => {
    expect(iconInitials("  ")).toBe("A");
  });
});

describe("wordmarkParts", () => {
  it("keeps the whole name, since the Signal Line mark doesn't spell IFC", () => {
    expect(wordmarkParts(DEFAULT_BRANDING.name)).toEqual({
      lead: "IFC Production",
      soft: "Academy",
    });
  });

  it("handles other names", () => {
    expect(wordmarkParts("Booth")).toEqual({ lead: "Booth", soft: "" });
    expect(wordmarkParts("The Media Team")).toEqual({ lead: "The Media", soft: "Team" });
  });
});

describe("brandIconUrl", () => {
  it("points at the public bucket", () => {
    expect(brandIconUrl("https://x.supabase.co/", "app-icon-1.png")).toBe(
      "https://x.supabase.co/storage/v1/object/public/branding/app-icon-1.png",
    );
  });
});

describe("isSquarePng", () => {
  it("accepts a PNG of the right size", () => {
    expect(isSquarePng(pngHeader(512, 512), 512)).toBe(true);
  });

  it.each([
    ["the wrong size", pngHeader(256, 256)],
    ["not square", pngHeader(512, 256)],
    ["not a PNG", new Uint8Array(24)],
    ["too short to be a PNG", new Uint8Array(4)],
  ])("refuses %s", (_, bytes) => {
    expect(isSquarePng(bytes, 512)).toBe(false);
  });
});

describe("manifestIcons", () => {
  it("keeps the original icons until one is chosen", () => {
    expect(manifestIcons(null).map((icon) => icon.src)).toContain("/icons/icon-512.png");
  });

  it("gives the built-in icon separate any and maskable files at 192 and 512", () => {
    const icons = manifestIcons(null).map((icon) => `${icon.purpose} ${icon.sizes} ${icon.src}`);
    expect(icons).toEqual([
      "any 192x192 /icons/icon-192.png",
      "any 512x512 /icons/icon-512.png",
      "maskable 192x192 /icons/icon-maskable-192.png",
      "maskable 512x512 /icons/icon-maskable-512.png",
    ]);
  });

  it("uses the chosen icon, including for Android's masked shape", () => {
    const icons = manifestIcons("https://x/icon.png");
    expect(icons.every((icon) => icon.src === "https://x/icon.png")).toBe(true);
    expect(icons.map((icon) => icon.purpose)).toEqual(["any", "maskable"]);
  });
});
