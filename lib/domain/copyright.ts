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

// The six emails (ADD-COPY-09). Fill-ins are written in braces, in plain words.

export const TEMPLATE_KEYS = [
  "received",
  "new_request",
  "review_needed",
  "approved",
  "declined",
  "cleared",
] as const;
export type TemplateKey = (typeof TEMPLATE_KEYS)[number];

export type EmailTemplate = { subject: string; body: string };

export const TEMPLATE_INFO: Record<TemplateKey, { name: string; when: string }> = {
  received: { name: "We got it", when: "Sent to the requester as soon as they send the form." },
  new_request: {
    name: "New request",
    when: "Sent to everyone on the Quality control list, with their private link.",
  },
  review_needed: {
    name: "Copyright review needed",
    when: "Sent to the copyright reviewers Quality control chooses.",
  },
  approved: {
    name: "Approved",
    when: "Sent to the requester when Quality control or a copyright reviewer approves. A reviewer's decision copies Quality control.",
  },
  declined: {
    name: "Not approved",
    when: "Sent to the requester when Quality control or a copyright reviewer declines. A reviewer's decision copies Quality control.",
  },
  cleared: {
    name: "Cleared to show",
    when: "Sent to the media inbox, and to everyone on duty that day if that's on.",
  },
};

export const FILL_INS = [
  "first name",
  "what",
  "title",
  "service date",
  "reference",
  "deadline",
  "requester name",
  "reviewer name",
  "reviewer note",
  "question",
  "asked by",
] as const;
export type FillIn = (typeof FILL_INS)[number];

export const DEFAULT_TEMPLATES: Record<TemplateKey, EmailTemplate> = {
  received: {
    subject: "We got your request for {service date}",
    body: "Hi {first name},\n\nThanks for sending your {what} for {service date}. Our Quality control team will check it, and we'll email you as soon as it's decided.\n\nReference {reference}",
  },
  new_request: {
    subject: "New request: {what} for {service date}",
    body: "A new request needs checking.\n\nFrom {requester name}\n{what} for {service date}\n{title}",
  },
  review_needed: {
    subject: "Copyright review needed: {what} for {service date}",
    body: "Hi {first name},\n\n{asked by} from Quality control would like a copyright check on a request for {service date}.\n\nThey ask:\n{question}",
  },
  approved: {
    subject: "Approved: your {what} for {service date}",
    body: "Hi {first name},\n\nGood news: your {what} “{title}” has been approved to show on {service date}.\n\nA note from {reviewer name}:\n{reviewer note}",
  },
  declined: {
    subject: "Not approved: your {what} for {service date}",
    body: "Hi {first name},\n\nThanks for sending “{title}”. We can't show it on {service date} as it is, but here's what would help:\n\n{reviewer note}",
  },
  cleared: {
    subject: "Approved media: {what} for {service date}",
    body: "“{title}” is cleared to show on {service date}.\n\nAsked by {requester name}. Approved by {reviewer name}.\n\n{reviewer note}\n\nEveryone on duty sees it in the Academy when they sign in.",
  },
};

export const templateSchema = z.object({
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(4000),
});

/** The templates in use: each saved one, or the original where none was saved or it's broken. */
export function templatesFrom(saved: unknown): Record<TemplateKey, EmailTemplate> {
  const result = { ...DEFAULT_TEMPLATES };
  if (typeof saved !== "object" || saved === null) {
    return result;
  }
  for (const key of TEMPLATE_KEYS) {
    const parsed = templateSchema.safeParse((saved as Record<string, unknown>)[key]);
    if (parsed.success) {
      result[key] = parsed.data;
    }
  }
  return result;
}

export type FillInValues = Partial<Record<FillIn, string>>;

/**
 * Puts the values into a template. A fill-in with no value becomes empty, and the blank lines it
 * leaves are tidied away. Unknown braces stay as written, so a typo shows in the preview.
 */
export function fillTemplate(text: string, values: FillInValues): string {
  const filled = text.replace(/\{([a-z ]+)\}/g, (match, name: string) =>
    (FILL_INS as readonly string[]).includes(name) ? (values[name as FillIn] ?? "") : match,
  );
  return filled
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

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
    message: "Choose the service, or another date.",
    path: ["eventId"],
  })
  .refine((form) => form.mediaUrl !== "" || (form.kind === "graphic" && form.filePath !== ""), {
    message: "Add a link, or upload the graphic.",
    path: ["mediaUrl"],
  });

export type RequestForm = z.infer<typeof requestFormSchema>;
