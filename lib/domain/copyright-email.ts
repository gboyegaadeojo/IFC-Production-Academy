/**
 * The six video and graphics approval emails (ADD-COPY-09): their originals, fill-ins, and how a
 * queued one becomes an email. No packages, because the notifications job runs it with Node alone
 * (scripts/send-notifications.ts). lib/domain/copyright.ts re-exports all of it.
 */
import { calmEmailHtml } from "./email-design.ts";

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

/** A saved template, if it has a subject (up to 200) and a message (up to 4,000). */
export function validTemplate(value: unknown): EmailTemplate | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const { subject, body } = value as { subject?: unknown; body?: unknown };
  if (typeof subject !== "string" || typeof body !== "string") {
    return null;
  }
  const s = subject.trim();
  const b = body.trim();
  return s.length >= 1 && s.length <= 200 && b.length >= 1 && b.length <= 4000
    ? { subject: s, body: b }
    : null;
}

/** The templates in use: each saved one, or the original where none was saved or it's broken. */
export function templatesFrom(saved: unknown): Record<TemplateKey, EmailTemplate> {
  const result = { ...DEFAULT_TEMPLATES };
  if (typeof saved !== "object" || saved === null) {
    return result;
  }
  for (const key of TEMPLATE_KEYS) {
    const template = validTemplate((saved as Record<string, unknown>)[key]);
    if (template) {
      result[key] = template;
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

// Emails (ADD-COPY-09). The job hands each queued email here with the organisation's templates.

/** Each email's button, when it has one. A queued link wins; otherwise these places. */
const BUTTONS: Record<TemplateKey, { label: string; fallback: string | null }> = {
  received: { label: "See its progress", fallback: null },
  new_request: { label: "Review it", fallback: null },
  review_needed: { label: "Review it", fallback: null },
  approved: { label: "", fallback: null },
  declined: { label: "Send a new version", fallback: "/media-request" },
  cleared: { label: "Open the Academy", fallback: "/home" },
};

const FOOTERS: Record<TemplateKey, string> = {
  received: "Only people with this email's link can see your request.",
  new_request:
    "This link is just for you and needs no sign-in. It works for 30 days, while you're on the Quality control list.",
  review_needed:
    "No sign-in needed if you're outside the Academy: the link opens only this request, until it's decided or for 14 days.",
  approved: "Questions? Just reply to this email.",
  declined: "Questions? Just reply to this email.",
  cleared: "Everyone scheduled on this service sees it in the Academy when they sign in.",
};

export function isTemplateKey(value: string): value is TemplateKey {
  return (TEMPLATE_KEYS as readonly string[]).includes(value);
}

/** Only the known fill-ins, as text, from what the database queued. */
export function fillInsFrom(vars: unknown): FillInValues {
  const values: FillInValues = {};
  if (typeof vars !== "object" || vars === null) {
    return values;
  }
  for (const name of FILL_INS) {
    const value = (vars as Record<string, unknown>)[name];
    if (typeof value === "string") {
      values[name] = value;
    }
  }
  return values;
}

/** One queued email, ready for Resend: the template filled in, as text and in the Calm design. */
export function copyrightEmail(
  item: { template: TemplateKey; vars: unknown; link: string | null; templates: unknown },
  siteUrl: string,
  appName = "IFC Production Academy",
): { subject: string; text: string; html: string } {
  const site = siteUrl.replace(/\/+$/, "");
  const template = templatesFrom(item.templates)[item.template];
  const values = fillInsFrom(item.vars);
  const subject = fillTemplate(template.subject, values).replaceAll("\n", " ").slice(0, 200);
  const body = fillTemplate(template.body, values);
  const button = BUTTONS[item.template];
  const path = item.link ?? button.fallback;
  const url = path && button.label ? `${site}${path}` : null;
  const paragraphs = body
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);
  const footer = FOOTERS[item.template];
  const text = [body, url ? `\n${button.label}: ${url}` : "", "", `From ${appName}. ${footer}`]
    .filter((line, index) => line !== "" || index === 2)
    .join("\n");
  const html = calmEmailHtml({
    preheader: paragraphs[0] ?? subject,
    title: subject,
    paragraphs,
    button: url ? { label: button.label, url } : null,
    iconUrl: `${site}/brand/icon`,
    footer: { text: footer },
    appName,
  });
  return { subject, text, html };
}
