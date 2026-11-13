/**
 * Video and graphics approvals (ADD-COPY-01..10; docs/decisions/2026-11-12-copyright-approvals.md).
 * Pure rules shared by the app, the email job and the tests: the deadline and what counts as late,
 * references, what the requester sees, and the six emails with their fill-ins. The database applies
 * the same deadline rule (private.copyright_lead_days); the tests here pin the shared examples.
 */
import { z } from "zod";

export const REQUEST_KINDS = ["video", "graphic"] as const;
export type RequestKind = (typeof REQUEST_KINDS)[number];

export const REQUEST_STATUSES = [
  "new",
  "with_quality_control",
  "with_copyright_review",
  "approved",
  "declined",
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const DEADLINE_COUNTING = ["calendar", "business"] as const;
export type DeadlineCounting = (typeof DEADLINE_COUNTING)[number];

export const LATE_POLICIES = ["accept", "block"] as const;
export type LatePolicy = (typeof LATE_POLICIES)[number];

export const DEFAULT_DEADLINE = { days: 5, counting: "calendar" as DeadlineCounting };

/** A private link's lifetimes (ADD-COPY-04, ADD-COPY-05). The database uses the same numbers. */
export const QUALITY_CONTROL_LINK_DAYS = 30;
export const REVIEW_LINK_DAYS = 14;
export const REQUESTS_PER_EMAIL_PER_DAY = 5;
export const GRAPHIC_MAX_BYTES = 20 * 1024 * 1024;
export const GRAPHIC_TYPES = ["image/png", "image/jpeg", "image/webp", "application/pdf"] as const;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function dayNumber(isoDate: string): number {
  if (!ISO_DATE.test(isoDate)) {
    throw new Error("Expected a date as YYYY-MM-DD");
  }
  return Math.round(Date.parse(`${isoDate}T00:00:00Z`) / 86_400_000);
}

/**
 * Days of notice between today and the service day, both Winnipeg dates. Calendar days count
 * every day after today up to and including the service day; business days count only Monday to
 * Friday among those. Thursday 12 Nov to Sunday 22 Nov is 10 calendar days or 6 business days.
 */
export function leadDays(today: string, serviceDay: string, counting: DeadlineCounting): number {
  const start = dayNumber(today);
  const end = dayNumber(serviceDay);
  if (end <= start) {
    return 0;
  }
  if (counting === "calendar") {
    return end - start;
  }
  let count = 0;
  for (let day = start + 1; day <= end; day += 1) {
    // 1970-01-01 was a Thursday: day 0 is Thursday, so (day + 4) % 7 gives 0 for Sunday.
    const weekday = (((day + 4) % 7) + 7) % 7;
    if (weekday !== 0 && weekday !== 6) {
      count += 1;
    }
  }
  return count;
}

export function isLate(
  today: string,
  serviceDay: string,
  deadline: { days: number; counting: DeadlineCounting },
): boolean {
  return leadDays(today, serviceDay, deadline.counting) < deadline.days;
}

/**
 * The first day a request can be for and still be on time: Thursday 12 Nov with 5 calendar days
 * gives Tuesday 17 Nov. The form's date picker starts there when late requests are refused.
 */
export function earliestOnTimeDay(
  today: string,
  deadline: { days: number; counting: DeadlineCounting },
): string {
  const start = dayNumber(today);
  for (let day = start; day <= start + 366; day += 1) {
    const iso = new Date(day * 86_400_000).toISOString().slice(0, 10);
    if (leadDays(today, iso, deadline.counting) >= deadline.days) {
      return iso;
    }
  }
  return today;
}

/** "5 days", "1 day", "3 business days": how the form and emails say the deadline. */
export function deadlineWording(deadline: { days: number; counting: DeadlineCounting }): string {
  const unit = deadline.counting === "business" ? "business day" : "day";
  return `${deadline.days} ${unit}${deadline.days === 1 ? "" : "s"}`;
}

/** A request's reference, as people read and say it: CR-0142. */
export function requestReference(requestNumber: number): string {
  return `CR-${String(requestNumber).padStart(4, "0")}`;
}

export type RequesterStep = "sent" | "quality_control" | "copyright_review" | "decision";

/**
 * What the requester's status page shows (ADD-COPY-03): each step done, current, or still to
 * come. The copyright review step only shows once a request has been sent for one.
 */
export function requesterSteps(
  status: RequestStatus,
  hadCopyrightReview: boolean,
): { step: RequesterStep; state: "done" | "current" | "upcoming" | "optional" }[] {
  const decided = status === "approved" || status === "declined";
  const inReview = status === "with_copyright_review";
  return [
    { step: "sent", state: "done" },
    { step: "quality_control", state: decided || inReview ? "done" : "current" },
    {
      step: "copyright_review",
      state: inReview ? "current" : hadCopyrightReview ? "done" : "optional",
    },
    { step: "decision", state: decided ? "done" : "upcoming" },
  ];
}

// The six emails live in ./copyright-email.ts, which the email job can run without packages.
export * from "./copyright-email.ts";

export const templateSchema = z.object({
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(4000),
});

/** What a request is, in an email: "video" or "graphic". */
export function kindWord(kind: RequestKind): string {
  return kind === "video" ? "video" : "graphic";
}

// The public form (ADD-COPY-01), checked again at the server boundary.

const httpsUrl = z
  .string()
  .trim()
  .max(500)
  .refine(
    (value) => /^https:\/\/[^\s]+\.[^\s]+$/.test(value),
    "Paste a link that starts with https://",
  );

export const requestFormSchema = z
  .object({
    firstName: z.string().trim().min(1, "Enter your first name.").max(60),
    lastName: z.string().trim().max(60),
    email: z.email("Enter a valid email address.").max(254),
    kind: z.enum(REQUEST_KINDS),
    mediaUrl: z.union([httpsUrl, z.literal("")]),
    filePath: z.string().max(300),
    eventId: z.union([z.uuid(), z.literal("")]),
    otherDate: z.union([z.string().regex(ISO_DATE), z.literal("")]),
    description: z.string().trim().min(1, "Say what it's for.").max(1000),
    website: z.string().max(200),
  })
  .refine((form) => form.eventId !== "" || form.otherDate !== "", {
    message: "Choose the date it should be shown.",
    path: ["eventId"],
  })
  .refine((form) => form.mediaUrl !== "" || (form.kind === "graphic" && form.filePath !== ""), {
    message: "Add a link, or upload the graphic.",
    path: ["mediaUrl"],
  });

export type RequestForm = z.infer<typeof requestFormSchema>;

/** A safe file name for an upload: letters, digits, dots, dashes, underscores, kept short. */
export function safeFileName(name: string): string {
  const cleaned = name
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+/, "")
    .slice(-100);
  return cleaned === "" || cleaned.startsWith(".") ? "graphic" : cleaned;
}

/** Whether an upload may be a graphic: one of the allowed types and no bigger than 20 MB. */
export function isAllowedGraphic(type: string, size: number): boolean {
  return (
    (GRAPHIC_TYPES as readonly string[]).includes(type) && size > 0 && size <= GRAPHIC_MAX_BYTES
  );
}
