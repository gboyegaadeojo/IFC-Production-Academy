import { describe, expect, it } from "vitest";
import { deviceSummary, pagePath, problemReportSchema } from "./problem-reports";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";
const ANDROID =
  "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36";
const IPAD_DESKTOP_MODE =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";
const MAC_SAFARI =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15";
const WINDOWS_EDGE =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0";

describe("deviceSummary", () => {
  it("names the phone and says when the app is installed", () => {
    expect(deviceSummary(IPHONE, true)).toBe("iPhone, app installed");
    expect(deviceSummary(ANDROID, false)).toBe("Android, Chrome");
  });

  it("knows an iPad that asks for the desktop site", () => {
    expect(deviceSummary(IPAD_DESKTOP_MODE, false)).toBe("iPad, Safari");
  });

  it("names the browser on a computer", () => {
    expect(deviceSummary(MAC_SAFARI, false)).toBe("Computer, Safari");
    expect(deviceSummary(WINDOWS_EDGE, false)).toBe("Computer, Edge");
  });
});

describe("pagePath", () => {
  it("keeps the path and drops anything that could hold a token or a name", () => {
    expect(pagePath("/serve/abc?position=1#top")).toBe("/serve/abc");
    expect(pagePath("/invite/x?code=secret")).toBe("/invite/x");
    expect(pagePath("https://example.com/home")).toBe("");
  });
});

describe("problemReportSchema", () => {
  it("trims the note and cleans the page", () => {
    const parsed = problemReportSchema.parse({
      message: "  The tick went back  ",
      page: "/serve/abc?x=1",
      device: "iPhone, app installed",
      appVersion: "288b5e31efc1",
    });
    expect(parsed).toEqual({
      message: "The tick went back",
      page: "/serve/abc",
      device: "iPhone, app installed",
      appVersion: "288b5e31efc1",
    });
  });

  it("asks for a note", () => {
    const result = problemReportSchema.safeParse({
      message: "   ",
      page: "/",
      device: "",
      appVersion: "",
    });
    expect(result.success).toBe(false);
  });
});
