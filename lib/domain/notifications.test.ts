import { describe, expect, it } from "vitest";
import {
  isQuietHours,
  NOTIFICATION_KIND_LABELS,
  NOTIFICATION_KINDS,
  notificationEmail,
  notificationUrl,
} from "./notifications";

describe("notificationUrl", () => {
  it("only links inside the Academy", () => {
    expect(notificationUrl("https://academy.example.org/", "/schedule")).toBe(
      "https://academy.example.org/schedule",
    );
    expect(notificationUrl("https://academy.example.org", "https://evil.example/x")).toBe(
      "https://academy.example.org/notifications",
    );
    expect(notificationUrl("https://academy.example.org", "//evil.example")).toBe(
      "https://academy.example.org//evil.example",
    );
    expect(notificationUrl("https://academy.example.org", null)).toBe(
      "https://academy.example.org/notifications",
    );
  });
});

describe("notificationEmail", () => {
  it("escapes names in the HTML and says how to turn emails off", () => {
    const email = notificationEmail(
      { title: "You're scheduled: <Camera 2>", body: "Fake service & more", link: "/schedule" },
      "https://academy.example.org",
    );
    expect(email.subject).toBe("IFC Production Academy: You're scheduled: <Camera 2>");
    expect(email.html).toContain("&lt;Camera 2&gt;");
    expect(email.html).toContain("Fake service &amp; more");
    expect(email.html).not.toContain("<Camera 2>");
    expect(email.text).toContain("https://academy.example.org/schedule");
    expect(email.text).toContain("https://academy.example.org/notifications");
  });
});

describe("isQuietHours", () => {
  it("holds email from 20:00 to 08:00 Winnipeg time", () => {
    // Summer 2026 (UTC-5). Later dates depend on the time-zone data: Manitoba moved to permanent
    // daylight time on 1 Nov 2026 (IANA tz 2026e), and older runtimes still expect a winter offset.
    expect(isQuietHours(new Date("2026-07-10T12:59:00Z"))).toBe(true); // 07:59
    expect(isQuietHours(new Date("2026-07-10T13:00:00Z"))).toBe(false); // 08:00
    expect(isQuietHours(new Date("2026-07-11T00:59:00Z"))).toBe(false); // 19:59
    expect(isQuietHours(new Date("2026-07-11T01:00:00Z"))).toBe(true); // 20:00
    expect(isQuietHours(new Date("2026-07-11T05:00:00Z"))).toBe(true); // 00:00
  });
});

describe("notification kinds", () => {
  it("lists every kind once, each with a label for the settings page", () => {
    expect(new Set(NOTIFICATION_KINDS).size).toBe(NOTIFICATION_KINDS.length);
    expect([...NOTIFICATION_KINDS].sort()).toEqual(Object.keys(NOTIFICATION_KIND_LABELS).sort());
  });
});
