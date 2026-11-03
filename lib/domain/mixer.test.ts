import { describe, expect, it } from "vitest";
import { channelsToShow, DEFAULT_CHANNELS, levelPercent, MIXER_CHANNELS } from "./mixer";

describe("MIXER_CHANNELS", () => {
  it("covers the X32: 32 channels, 8 aux, 8 FX returns, 16 buses, 6 matrix, 3 mains", () => {
    expect(MIXER_CHANNELS).toHaveLength(73);
    expect(new Set(MIXER_CHANNELS.map((channel) => channel.id)).size).toBe(73);
  });

  it("uses ids a layout can store", () => {
    for (const channel of MIXER_CHANNELS) {
      expect(channel.id).toMatch(/^[a-z0-9-]{1,12}$/);
    }
  });
});

describe("channelsToShow", () => {
  it("keeps the editors' choice and order", () => {
    expect(channelsToShow(["ch13", "main-l"])).toEqual(["ch13", "main-l"]);
  });

  it("drops channels this desk doesn't have", () => {
    expect(channelsToShow(["ch99", "ch01"])).toEqual(["ch01"]);
  });

  it("shows a sensible default until someone chooses", () => {
    expect(channelsToShow([])).toEqual(DEFAULT_CHANNELS);
    expect(channelsToShow(["nope"])).toEqual(DEFAULT_CHANNELS);
  });
});

describe("levelPercent", () => {
  it("puts full scale at the top and -60 dB at the bottom", () => {
    expect(levelPercent(1)).toBe(100);
    expect(levelPercent(0.001)).toBe(0);
  });

  it("places -6 dB at 90%", () => {
    expect(levelPercent(0.5012)).toBe(90);
  });

  it("clamps what the desk's headroom can report above full scale", () => {
    expect(levelPercent(8)).toBe(100);
  });

  it.each([0, -1, Number.NaN])("reads %s as silence", (value) => {
    expect(levelPercent(value)).toBe(0);
  });
});
