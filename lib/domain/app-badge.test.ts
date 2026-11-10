import { describe, expect, it, vi } from "vitest";
import { applyAppBadge, badgesByEndpoint } from "./app-badge";

describe("the number on the app's icon", () => {
  it("shows the count, and clears it at zero", async () => {
    const host = { setAppBadge: vi.fn(async () => {}), clearAppBadge: vi.fn(async () => {}) };
    expect(await applyAppBadge(5, host)).toBe(true);
    expect(host.setAppBadge).toHaveBeenCalledWith(5);
    expect(await applyAppBadge(0, host)).toBe(true);
    expect(host.clearAppBadge).toHaveBeenCalled();
  });

  it("does nothing where the device can't show one", async () => {
    expect(await applyAppBadge(3, {})).toBe(false);
  });

  it("never throws when the device refuses", async () => {
    const host = {
      setAppBadge: async () => {
        throw new Error("Not allowed");
      },
    };
    expect(await applyAppBadge(2, host)).toBe(false);
  });

  it("finds each device's number by its push address", () => {
    const map = badgesByEndpoint([{ endpoint: "https://push.example/a", badge: 4 }]);
    expect(map.get("https://push.example/a")).toBe(4);
    expect(badgesByEndpoint(null).size).toBe(0);
  });
});
