import { describe, expect, it } from "vitest";
import { navMarkerPosition } from "./nav-marker";

describe("navMarkerPosition", () => {
  it("lines up with the link's words, measured from the list", () => {
    expect(navMarkerPosition({ left: 300, width: 100 }, { left: 200 })).toEqual({
      x: 112,
      width: 76,
    });
  });

  it("never gives a negative width", () => {
    expect(navMarkerPosition({ left: 0, width: 10 }, { left: 0 }).width).toBe(0);
  });
});
