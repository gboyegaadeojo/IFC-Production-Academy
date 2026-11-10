import { describe, expect, it } from "vitest";
import { isNewVersion, reloadNow } from "./app-version";

describe("keeping the app on the latest version", () => {
  it("sees a new version only when both are known and differ", () => {
    expect(isNewVersion("abc", "def")).toBe(true);
    expect(isNewVersion("abc", "abc")).toBe(false);
    expect(isNewVersion("abc", "")).toBe(false);
    expect(isNewVersion(undefined, "def")).toBe(false);
  });

  it("loads it when the app comes back, unless someone is typing or it already tried", () => {
    const base = { stale: "def", justReturned: true, typing: false, alreadyReloadedFor: null };
    expect(reloadNow(base)).toBe(true);
    expect(reloadNow({ ...base, typing: true })).toBe(false);
    expect(reloadNow({ ...base, justReturned: false })).toBe(false);
    expect(reloadNow({ ...base, stale: null })).toBe(false);
    expect(reloadNow({ ...base, alreadyReloadedFor: "def" })).toBe(false);
  });
});
