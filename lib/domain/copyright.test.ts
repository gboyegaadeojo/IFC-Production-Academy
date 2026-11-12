import { describe, expect, it } from "vitest";
import {
  DEFAULT_TEMPLATES,
  deadlineWording,
  fillTemplate,
  isLate,
  leadDays,
  requestFormSchema,
  requestReference,
  requesterSteps,
  templatesFrom,
} from "./copyright";

describe("leadDays", () => {
  it("counts calendar days after today up to the service day", () => {
    expect(leadDays("2026-11-12", "2026-11-22", "calendar")).toBe(10);
    expect(leadDays("2026-11-12", "2026-11-15", "calendar")).toBe(3);
  });

  it("counts only Monday to Friday as business days", () => {
    // Thursday 12 Nov to Sunday 22 Nov: Fri 13, then Mon 16 to Fri 20.
    expect(leadDays("2026-11-12", "2026-11-22", "business")).toBe(6);
    // Friday to the following Monday: only Monday counts.
    expect(leadDays("2026-11-13", "2026-11-16", "business")).toBe(1);
  });

  it("is zero on the day or after it", () => {
    expect(leadDays("2026-11-22", "2026-11-22", "calendar")).toBe(0);
    expect(leadDays("2026-11-23", "2026-11-22", "business")).toBe(0);
  });

  it("refuses something that isn't a date", () => {
    expect(() => leadDays("12/11/2026", "2026-11-22", "calendar")).toThrow();
  });
});

describe("isLate", () => {
  const deadline = { days: 5, counting: "calendar" as const };

  it("is on time with at least the deadline's notice", () => {
    expect(isLate("2026-11-12", "2026-11-17", deadline)).toBe(false);
    expect(isLate("2026-11-12", "2026-11-22", deadline)).toBe(false);
  });

  it("is late with less", () => {
    expect(isLate("2026-11-12", "2026-11-15", deadline)).toBe(true);
  });

  it("can be late in business days when it isn't in calendar days", () => {
    expect(isLate("2026-11-12", "2026-11-17", { days: 5, counting: "business" })).toBe(true);
  });
});

describe("deadlineWording", () => {
  it("says the deadline the way the form shows it", () => {
    expect(deadlineWording({ days: 5, counting: "calendar" })).toBe("5 days");
    expect(deadlineWording({ days: 1, counting: "calendar" })).toBe("1 day");
    expect(deadlineWording({ days: 3, counting: "business" })).toBe("3 business days");
  });
});

describe("requestReference", () => {
  it("pads to four digits", () => {
    expect(requestReference(142)).toBe("CR-0142");
    expect(requestReference(12345)).toBe("CR-12345");
  });
});

describe("requesterSteps", () => {
  it("shows Quality control as current for a new request, with the review step optional", () => {
    expect(requesterSteps("new", false).map((s) => s.state)).toEqual([
      "done",
      "current",
      "optional",
      "upcoming",
    ]);
  });

  it("shows the copyright review as current while it's with a reviewer", () => {
    expect(requesterSteps("with_copyright_review", true).map((s) => s.state)).toEqual([
      "done",
      "done",
      "current",
      "upcoming",
    ]);
  });

  it("marks everything done once decided after a review", () => {
    expect(requesterSteps("approved", true).every((s) => s.state === "done")).toBe(true);
  });
});

describe("fillTemplate", () => {
  it("puts values into the fill-ins", () => {
    expect(
      fillTemplate(DEFAULT_TEMPLATES.received.subject, { "service date": "Sunday 22 Nov" }),
    ).toBe("We got your request for Sunday 22 Nov");
  });

  it("drops a missing value and tidies the blank lines it leaves", () => {
    const text = fillTemplate("Hi {first name},\n\nA note:\n{reviewer note}\n\n\nThanks", {
      "first name": "Sam",
    });
    expect(text).toBe("Hi Sam,\n\nA note:\n\nThanks");
  });

  it("leaves an unknown fill-in as written, so a typo shows in the preview", () => {
    expect(fillTemplate("Hi {frist name}", { "first name": "Sam" })).toBe("Hi {frist name}");
  });
});

describe("templatesFrom", () => {
  it("uses a saved template and the original for the rest", () => {
    const templates = templatesFrom({ approved: { subject: "Yes!", body: "Approved." } });
    expect(templates.approved).toEqual({ subject: "Yes!", body: "Approved." });
    expect(templates.declined).toEqual(DEFAULT_TEMPLATES.declined);
  });

  it("ignores a broken saved template", () => {
    expect(templatesFrom({ approved: { subject: "" } }).approved).toEqual(
      DEFAULT_TEMPLATES.approved,
    );
    expect(templatesFrom(null)).toEqual(DEFAULT_TEMPLATES);
  });

  it("starts every Cleared to show subject with Approved media:, for the inbox's label", () => {
    expect(DEFAULT_TEMPLATES.cleared.subject.startsWith("Approved media:")).toBe(true);
  });
});

describe("requestFormSchema", () => {
  const base = {
    firstName: "Sam",
    lastName: "Rivera",
    email: "sam.rivera@example.com",
    kind: "video" as const,
    mediaUrl: "https://www.youtube.com/watch?v=example",
    filePath: "",
    eventId: "",
    otherDate: "2026-11-22",
    description: "Missions moment before the offering",
    website: "",
  };

  it("accepts a video link for another date", () => {
    expect(requestFormSchema.safeParse(base).success).toBe(true);
  });

  it("needs a service or a date", () => {
    expect(requestFormSchema.safeParse({ ...base, otherDate: "" }).success).toBe(false);
  });

  it("needs a link for a video, and a link or upload for a graphic", () => {
    expect(requestFormSchema.safeParse({ ...base, mediaUrl: "" }).success).toBe(false);
    expect(
      requestFormSchema.safeParse({
        ...base,
        kind: "graphic",
        mediaUrl: "",
        filePath: "requests/x/slide.png",
      }).success,
    ).toBe(true);
  });

  it("only takes https links", () => {
    expect(requestFormSchema.safeParse({ ...base, mediaUrl: "http://example.com/v" }).success).toBe(
      false,
    );
  });
});
