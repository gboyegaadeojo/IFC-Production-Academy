import { describe, expect, it } from "vitest";
import {
  LOGO_VIEWBOX,
  logoSize,
  markCut,
  markPixels,
  MARK_PLACEMENT,
  STACKED_OFFSETS,
} from "./brand-logo";

describe("logoSize", () => {
  it("keeps the mark square", () => {
    expect(logoSize("mark", 16)).toEqual({ width: 16, height: 16 });
    expect(logoSize("mark", 30)).toEqual({ width: 30, height: 30 });
  });

  it("keeps the horizontal logo's proportions: 366 by 104", () => {
    expect(logoSize("horizontal", 104)).toEqual({ width: 366, height: 104 });
    expect(logoSize("horizontal", 52)).toEqual({ width: 183, height: 52 });
  });

  it("keeps the stacked logo's proportions", () => {
    expect(logoSize("stacked", 184)).toEqual({ width: 246, height: 184 });
  });
});

describe("markPixels and markCut", () => {
  it("uses the heavier favicon cut only at small sizes", () => {
    expect(markCut(markPixels("mark", 16))).toEqual({ strokeWidth: 11, dotRadius: 8 });
    expect(markCut(markPixels("mark", 24))).toEqual({ strokeWidth: 10, dotRadius: 7 });
    expect(markCut(markPixels("mark", 32))).toEqual({ strokeWidth: 10, dotRadius: 7 });
  });

  it("measures the mark inside a lockup, not the whole lockup", () => {
    expect(markPixels("horizontal", 52)).toBe(52);
    expect(markPixels("stacked", 184)).toBe(104);
  });
});

describe("the stacked layout", () => {
  it("centres the mark and both wordmark lines on one axis", () => {
    const box = LOGO_VIEWBOX.stacked;
    const centre = box.x + box.width / 2;
    const mark = MARK_PLACEMENT.stacked;
    expect(mark.x + mark.width / 2).toBe(centre);
    // The wordmark's lines span 152.3 to 389.7 ("IFC Production") and 152.3 to 262.5 ("ACADEMY").
    expect(Math.abs(STACKED_OFFSETS.name.x + (152.3 + 389.7) / 2 - centre)).toBeLessThan(1);
    expect(Math.abs(STACKED_OFFSETS.academy.x + (152.3 + 262.5) / 2 - centre)).toBeLessThan(1);
  });

  it("puts the wordmark below the mark, inside the box", () => {
    expect(STACKED_OFFSETS.name.y + 50).toBeGreaterThan(MARK_PLACEMENT.stacked.height);
    expect(STACKED_OFFSETS.academy.y + 101.94).toBeLessThan(LOGO_VIEWBOX.stacked.height);
  });
});
