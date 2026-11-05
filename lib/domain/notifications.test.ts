import { describe, expect, it } from "vitest";
import {
  APP_ONLY_KINDS,
  emailChoiceGroups,
  isQuietHours,
  NOTIFICATION_GROUPS,
  NOTIFICATION_KIND_LABELS,
  NOTIFICATION_KINDS,
  relativeTime,
  emailButtonLabel,
  notificationEmail,
  notificationUrl,
  onboardingEmail,
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
    expect(email.subject).toBe("You're scheduled: <Camera 2>");
    expect(email.html).toContain("&lt;Camera 2&gt;");
    expect(email.html).toContain("Fake service &amp; more");
    expect(email.html).not.toContain("<Camera 2>");
    expect(email.text).toContain("https://academy.example.org/schedule");
    expect(email.text).toContain("https://academy.example.org/notifications");
  });

  it("has one button that says what it does, and the message as the preview line", () => {
    const email = notificationEmail(
      {
        kind: "join_requested",
        title: "Riley asked to join",
        body: "Fake body",
        link: "/admin/members",
      },
      "https://academy.example.org",
    );
    expect(email.html).toContain(">Review the request</a>");
    expect(email.html).toContain('href="https://academy.example.org/admin/members"');
    expect(email.html).toMatch(/display:none[^>]*>Fake body</);
    expect(email.text).toContain("Review the request: https://academy.example.org/admin/members");
  });

  it("uses no SVG, which email programs drop, and shows the app's icon", () => {
    const email = notificationEmail(
      { kind: "learning_nudge", title: "Keep going", body: "Fake", link: "/home" },
      "https://academy.example.org/",
    );
    expect(email.html).not.toContain("<svg");
    expect(email.html).toContain('src="https://academy.example.org/icons/icon-192.png"');
  });

  it("falls back to a plain button for an unknown kind", () => {
    expect(emailButtonLabel("something-new")).toBe("Open the Academy");
  });

  it("labels every kind's button", () => {
    for (const kind of NOTIFICATION_KINDS) {
      expect(emailButtonLabel(kind)).not.toBe("Open the Academy");
    }
  });
});

describe("onboardingEmail", () => {
  const site = "https://academy.example.org";

  it("keeps the leader's subject and paragraphs, and escapes the HTML", () => {
    const email = onboardingEmail(
      {
        subject: "Hi Riley",
        body: "Welcome <b>Riley</b>\nGlad you're here\n\nSee you Sunday",
        hasAccount: false,
      },
      site,
    );
    expect(email.subject).toBe("Hi Riley");
    expect(email.html).toContain("Welcome &lt;b&gt;Riley&lt;/b&gt;<br>Glad you&#39;re here</p>");
    expect(email.html).toContain(">See you Sunday</p>");
    expect(email.html).not.toContain("<b>Riley</b>");
    expect(email.text).toContain("See you Sunday");
  });

  it("sends people with an account to their settings, and asks others to reply", () => {
    const member = onboardingEmail({ subject: "Hi", body: "Welcome", hasAccount: true }, site);
    expect(member.text).toContain("https://academy.example.org/notifications");
    const newcomer = onboardingEmail({ subject: "Hi", body: "Welcome", hasAccount: false }, site);
    expect(newcomer.text).not.toContain("/notifications");
    expect(newcomer.text).toContain("reply and let us know");
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

  it("puts every kind in exactly one email group", () => {
    const grouped = NOTIFICATION_GROUPS.flatMap((group) => group.kinds);
    const offered = NOTIFICATION_KINDS.filter((kind) => !APP_ONLY_KINDS.includes(kind));
    expect(grouped.toSorted()).toEqual(offered.sort());
  });
});

describe("emailChoiceGroups", () => {
  it("offers leading choices only to people who lead", () => {
    expect(emailChoiceGroups(false).map((g) => g.id)).toEqual(["serving", "training"]);
    expect(emailChoiceGroups(true).map((g) => g.id)).toEqual(["serving", "training", "leading"]);
  });
});

describe("relativeTime", () => {
  const now = new Date("2026-11-01T18:00:00Z"); // 1 p.m. in Winnipeg

  it("uses minutes and hours for today", () => {
    expect(relativeTime("2026-11-01T17:59:40Z", now)).toBe("now");
    expect(relativeTime("2026-11-01T17:55:00Z", now)).toBe("5m");
    expect(relativeTime("2026-11-01T16:00:00Z", now)).toBe("2h");
  });

  it("says Yesterday by the Winnipeg calendar, then a short date", () => {
    expect(relativeTime("2026-10-31T15:00:00Z", now)).toBe("Yesterday");
    expect(relativeTime("2026-10-30T15:00:00Z", now)).toBe("Oct 30");
  });
});
