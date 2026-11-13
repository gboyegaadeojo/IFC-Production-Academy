import { describe, expect, it } from "vitest";
import {
  copyrightEmail,
  DEFAULT_TEMPLATES,
  fillInsFrom,
  isAllowedGraphic,
  safeFileName,
  deadlineWording,
  earliestOnTimeDay,
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

  it("drops a missing value, the heading that introduced it, and the blank lines left", () => {
    const text = fillTemplate("Hi {first name},\n\nA note:\n{reviewer note}\n\n\nThanks", {
      "first name": "Sam",
    });
    expect(text).toBe("Hi Sam,\n\nThanks");
  });

  it("drops an empty note from the Approved email, as G saw it (2026-11-13)", () => {
    const text = fillTemplate(DEFAULT_TEMPLATES.approved.body, {
      "first name": "Gboyega",
      what: "video",
      title: "Because Na Me",
      "service date": "Sunday 22 Nov",
      "reviewer name": "gboyega",
    });
    expect(text).not.toContain("A note from");
    expect(text.endsWith("has been approved to show on Sunday 22 Nov.")).toBe(true);
  });

  it("keeps the note's heading when there is a note", () => {
    const text = fillTemplate(DEFAULT_TEMPLATES.approved.body, {
      "reviewer name": "Robin",
      "reviewer note": "Covered by our licence.",
    });
    expect(text).toContain("A note from Robin:\nCovered by our licence.");
  });

  it("says who asked for a copyright review without repeating Quality control", () => {
    const text = fillTemplate(DEFAULT_TEMPLATES.review_needed.body, {
      "first name": "Robin",
      what: "video",
      title: "Because Na Me",
      "service date": "Sunday 22 Nov",
      "requester name": "Gboyega",
      "asked by": "IFC Quality Control Team",
      question: "Check the music.",
    });
    expect(text).toContain("Quality control (IFC Quality Control Team) would like");
    expect(text).toContain("“Because Na Me”, sent by Gboyega");
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

describe("copyrightEmail", () => {
  const vars = {
    "first name": "Sam",
    what: "video",
    title: "Missions moment",
    "service date": "Sunday 22 Nov",
    reference: "CR-0142",
    "reviewer name": "Robin",
    "reviewer note": "Covered by our licence.",
  };

  it("fills the template and links the button to the queued link", () => {
    const email = copyrightEmail(
      { template: "received", vars, link: "/media-request/status/abc", templates: {} },
      "https://academy.example.org/",
    );
    expect(email.subject).toBe("We got your request for Sunday 22 Nov");
    expect(email.text).toContain("Hi Sam,");
    expect(email.text).toContain(
      "See its progress: https://academy.example.org/media-request/status/abc",
    );
    expect(email.html).toContain('href="https://academy.example.org/media-request/status/abc"');
  });

  it("uses a saved template", () => {
    const email = copyrightEmail(
      {
        template: "approved",
        vars,
        link: null,
        templates: { approved: { subject: "Yes for {service date}", body: "Go, {first name}." } },
      },
      "https://academy.example.org",
    );
    expect(email.subject).toBe("Yes for Sunday 22 Nov");
    expect(email.text.startsWith("Go, Sam.")).toBe(true);
  });

  it("sends a declined requester back to the form", () => {
    const email = copyrightEmail(
      { template: "declined", vars, link: null, templates: {} },
      "https://academy.example.org",
    );
    expect(email.text).toContain("https://academy.example.org/media-request");
  });

  it("escapes what people typed", () => {
    const email = copyrightEmail(
      {
        template: "approved",
        vars: { ...vars, "reviewer note": "<b>hi</b>" },
        link: null,
        templates: {},
      },
      "https://academy.example.org",
    );
    expect(email.html).not.toContain("<b>hi</b>");
  });

  it("ignores fill-ins it doesn't know", () => {
    expect(fillInsFrom({ "first name": "Sam", secret: "x", what: 3 })).toEqual({
      "first name": "Sam",
    });
  });
});

describe("uploads", () => {
  it("makes a safe file name", () => {
    expect(safeFileName("Youth retreat (final).PNG")).toBe("Youth-retreat-final-.PNG");
    expect(safeFileName("../../etc/passwd")).toBe("etc-passwd");
    expect(safeFileName("???")).toBe("graphic");
  });

  it("allows images and PDFs up to 20 MB", () => {
    expect(isAllowedGraphic("image/png", 1000)).toBe(true);
    expect(isAllowedGraphic("application/pdf", 20 * 1024 * 1024)).toBe(true);
    expect(isAllowedGraphic("image/svg+xml", 1000)).toBe(false);
    expect(isAllowedGraphic("image/png", 20 * 1024 * 1024 + 1)).toBe(false);
  });
});

describe("earliestOnTimeDay", () => {
  it("is the first day with enough notice", () => {
    expect(earliestOnTimeDay("2026-11-12", { days: 5, counting: "calendar" })).toBe("2026-11-17");
    // Thursday 12 Nov, 5 business days: Fri 13, Mon 16 to Thu 19.
    expect(earliestOnTimeDay("2026-11-12", { days: 5, counting: "business" })).toBe("2026-11-19");
  });

  it("is today with no deadline", () => {
    expect(earliestOnTimeDay("2026-11-12", { days: 0, counting: "calendar" })).toBe("2026-11-12");
  });
});
