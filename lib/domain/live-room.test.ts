import { describe, expect, it } from "vitest";
import {
  BRIDGE_PROTOCOL,
  bridgeMessageSchema,
  bridgeTokenFrom,
  bridgeTokenMatches,
  isBridgeOffline,
  mintLiveTicket,
  TICKET_SECONDS,
  verifyLiveTicket,
} from "./live-room";

const NOW = Date.parse("2026-11-08T16:00:00Z");

describe("tickets", () => {
  it("lets in a fresh ticket", async () => {
    expect(await verifyLiveTicket("secret", await mintLiveTicket("secret", NOW), NOW)).toBe(true);
  });

  it("refuses an expired ticket", async () => {
    const ticket = await mintLiveTicket("secret", NOW);
    expect(await verifyLiveTicket("secret", ticket, NOW + (TICKET_SECONDS + 1) * 1000)).toBe(false);
  });

  it("refuses one signed with another secret", async () => {
    expect(await verifyLiveTicket("secret", await mintLiveTicket("other", NOW), NOW)).toBe(false);
  });

  it("refuses a ticket with its time changed", async () => {
    const [, signature] = (await mintLiveTicket("secret", NOW)).split(".");
    const later = Math.floor(NOW / 1000) + 100_000;
    expect(await verifyLiveTicket("secret", `${later}.${signature}`, NOW)).toBe(false);
  });

  it.each([null, "", "abc", "1.2.3", "x.y"])("refuses %s", async (ticket) => {
    expect(await verifyLiveTicket("secret", ticket, NOW)).toBe(false);
  });
});

describe("the bridge's token", () => {
  it("reads it from the subprotocol header", () => {
    expect(bridgeTokenFrom(`${BRIDGE_PROTOCOL}, abc`)).toBe("abc");
  });

  it.each([null, "", "other, abc", BRIDGE_PROTOCOL])("finds none in %s", (header) => {
    expect(bridgeTokenFrom(header)).toBeNull();
  });

  it("compares exactly", () => {
    expect(bridgeTokenMatches("abc", "abc")).toBe(true);
    expect(bridgeTokenMatches("abc", "abd")).toBe(false);
    expect(bridgeTokenMatches("abc", "ab")).toBe(false);
    expect(bridgeTokenMatches("abc", null)).toBe(false);
  });
});

describe("bridgeMessageSchema", () => {
  const reading = {
    type: "reading",
    levels: { ch01: 50, "main-l": 70 },
    names: { ch01: "Fake Vox" },
    encoder: { inputGood: true, input: "1080p", streams: [{ name: "Fake", live: true }] },
    timers: [{ name: "Fake", time: "00:01:00", state: "running" }],
  };

  it("accepts a full reading", () => {
    expect(bridgeMessageSchema.safeParse(reading).success).toBe(true);
  });

  it("accepts a reading with sources it couldn't reach", () => {
    expect(
      bridgeMessageSchema.safeParse({
        type: "reading",
        levels: null,
        names: null,
        encoder: null,
        timers: null,
      }).success,
    ).toBe(true);
  });

  it("accepts slides, with or without pictures", () => {
    expect(
      bridgeMessageSchema.safeParse({
        type: "slides",
        presentation: "Fake",
        position: 2,
        total: 6,
        slides: [
          { index: 2, text: "Fake line", image: "data:image/jpeg;base64,AAAA" },
          { index: 3, text: "Fake line two", image: null },
        ],
      }).success,
    ).toBe(true);
  });

  it.each([
    ["an unknown type", { type: "control", command: "next" }],
    ["a level off the scale", { ...reading, levels: { ch01: 500 } }],
    [
      "a picture that isn't an image",
      {
        type: "slides",
        presentation: "F",
        position: 0,
        total: 1,
        slides: [{ index: 0, text: "x", image: "javascript:alert(1)" }],
      },
    ],
    [
      "more than four slides",
      {
        type: "slides",
        presentation: "F",
        position: 0,
        total: 5,
        slides: [0, 1, 2, 3, 4].map((index) => ({ index, text: "x", image: null })),
      },
    ],
  ])("refuses %s", (_, message) => {
    expect(bridgeMessageSchema.safeParse(message).success).toBe(false);
  });
});

describe("isBridgeOffline", () => {
  it("is offline until first heard, and after 10 seconds of silence", () => {
    expect(isBridgeOffline(null, NOW)).toBe(true);
    expect(isBridgeOffline(NOW - 9000, NOW)).toBe(false);
    expect(isBridgeOffline(NOW - 11_000, NOW)).toBe(true);
  });
});
