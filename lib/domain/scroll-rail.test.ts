import { describe, expect, it } from "vitest";
import { railPosition } from "./scroll-rail";

describe("railPosition", () => {
  it("has one page and no arrows to use when everything fits", () => {
    expect(railPosition(0, 600, 800)).toEqual({ start: true, end: true, page: 0, pages: 1 });
    expect(railPosition(0, 801, 800)).toEqual({ start: true, end: true, page: 0, pages: 1 });
  });

  it("shows there's more at the start of a long row", () => {
    expect(railPosition(0, 2000, 800)).toEqual({ start: true, end: false, page: 0, pages: 3 });
  });

  it("moves the dot along as the row scrolls", () => {
    expect(railPosition(600, 2000, 800)).toMatchObject({ start: false, end: false, page: 1 });
  });

  it("reaches the end within a pixel of rounding", () => {
    expect(railPosition(1199.5, 2000, 800)).toEqual({
      start: false,
      end: true,
      page: 2,
      pages: 3,
    });
  });

  it("ignores overscroll past either edge", () => {
    expect(railPosition(-30, 2000, 800)).toMatchObject({ start: true, page: 0 });
    expect(railPosition(1500, 2000, 800)).toMatchObject({ end: true, page: 2 });
  });
});
