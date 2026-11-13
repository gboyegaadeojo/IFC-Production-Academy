/**
 * The six video and graphics approval emails (ADD-COPY-09): their originals, fill-ins, and how a
 * queued one becomes an email. No packages, because the notifications job runs it with Node alone
 * (scripts/send-notifications.ts). lib/domain/copyright.ts re-exports all of it.
 */
import { buttonColour, escapeHtml } from "./email-design.ts";

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
    when: "Sent to every copyright reviewer when Quality control asks for a copyright review.",
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
  // Design A (G, 2026-11-13): the details, the note and the question show in their own parts of
  // the email, so the messages don't repeat them.
  received: {
    subject: "We got your request for {service date}",
    body: "Hi {first name},\n\nThanks for sending your {what}. Our Quality control team will check it, and we'll email you as soon as it's decided.",
  },
  new_request: {
    subject: "New request: {what} for {service date}",
    body: "A new request needs checking. Approve it, decline it, or send it for a copyright review.",
  },
  review_needed: {
    subject: "Copyright review needed: {what} for {service date}",
    body: "Hi {first name},\n\nQuality control ({asked by}) would like a copyright check before {service date}.",
  },
  approved: {
    subject: "Approved: your {what} for {service date}",
    body: "Hi {first name},\n\nGood news: your {what} can be shown on {service date}.",
  },
  declined: {
    subject: "Not approved: your {what} for {service date}",
    body: "Hi {first name},\n\nThanks for sending “{title}”. We can't show it on {service date} as it is. You're welcome to send a new version.",
  },
  cleared: {
    subject: "Approved media: {what} for {service date}",
    body: "“{title}” is cleared to show on {service date}. Everyone on duty sees it in the Academy when they sign in.",
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
  const known = (name: string) => (FILL_INS as readonly string[]).includes(name);
  const fill = (line: string) =>
    line.replace(/\{([a-z ]+)\}/g, (match, name: string) =>
      known(name) ? (values[name as FillIn] ?? "") : match,
    );
  // A line of only fill-ins that are all empty goes, and so does a heading ending in ":" that only
  // introduced it, such as "A note from Robin:" when there's no note (G, 2026-11-13).
  const kept: string[] = [];
  for (const line of text.split("\n")) {
    const names = [...line.matchAll(/\{([a-z ]+)\}/g)].map((m) => m[1] ?? "").filter(known);
    const onlyEmptyFillIns =
      names.length > 0 &&
      names.every((name) => !values[name as FillIn]) &&
      !/[A-Za-z0-9]/.test(line.replace(/\{([a-z ]+)\}/g, ""));
    if (onlyEmptyFillIns) {
      if (kept.at(-1)?.endsWith(":")) {
        kept.pop();
      }
      continue;
    }
    kept.push(fill(line).trimEnd());
  }
  return kept
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
  accent?: string,
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
  const parts = DESIGN[item.template];
  const what = values.what === "graphic" ? "Graphic" : "Video";
  const rows = parts.rows
    .map((row) => ({
      label: row === "title" ? what : ROW_LABELS[row],
      value: values[row] ?? "",
    }))
    .filter((row) => row.value !== "");
  const boxText = parts.box ? (values[parts.box.from] ?? "") : "";
  const box =
    parts.box && boxText
      ? {
          heading:
            parts.box.from === "reviewer note" && values["reviewer name"]
              ? `${values["reviewer name"]}'s note`
              : parts.box.heading,
          text: boxText,
          tone: parts.box.tone,
        }
      : null;
  const fullText = [
    body,
    rows.map((row) => `${row.label}: ${row.value}`).join("\n"),
    box ? `${box.heading}:\n${box.text}` : "",
    url ? `${button.label}: ${url}` : "",
    `From ${appName}. ${footer}`,
  ]
    .filter((part) => part !== "")
    .join("\n\n");
  const html = designAHtml({
    preheader: paragraphs[0] ?? subject,
    status: parts.status,
    title: subject,
    paragraphs,
    rows,
    box,
    button: url ? { label: button.label, url } : null,
    iconUrl: `${site}/brand/icon`,
    footer,
    appName,
    accent: buttonColour(accent),
  });
  return { subject, text: fullText, html };
}

// Design A, "Clean card" (G, 2026-11-13): the app's icon and name, a status label, the headline, the
// message, a table of details, the note or question in a soft box, one button, and a quiet footer.
// Email-safe: tables and inline styles only, hosted images, no SVG.

type DetailRow = "title" | "service date" | "requester name" | "reviewer name" | "reference";

const ROW_LABELS: Record<Exclude<DetailRow, "title">, string> = {
  "service date": "Service",
  "requester name": "Sent by",
  "reviewer name": "Decided by",
  reference: "Reference",
};

type Tone = "green" | "purple" | "grey";

const TONES: Record<Tone, { bg: string; ink: string }> = {
  green: { bg: "#e3f4ea", ink: "#0a5130" },
  purple: { bg: "#efe9fd", ink: "#3f1fa0" },
  grey: { bg: "#efedf5", ink: "#4f4b63" },
};

const DESIGN: Record<
  TemplateKey,
  {
    status: { label: string; tone: Tone };
    rows: DetailRow[];
    box: { from: "reviewer note" | "question"; heading: string; tone: Tone } | null;
  }
> = {
  received: {
    status: { label: "Request received", tone: "purple" },
    rows: ["title", "service date", "reference"],
    box: null,
  },
  new_request: {
    status: { label: "New request", tone: "purple" },
    rows: ["title", "service date", "requester name", "reference"],
    box: null,
  },
  review_needed: {
    status: { label: "Copyright review", tone: "purple" },
    rows: ["title", "requester name", "service date"],
    box: { from: "question", heading: "What to check", tone: "purple" },
  },
  approved: {
    status: { label: "Approved", tone: "green" },
    rows: ["title", "service date", "reviewer name", "reference"],
    box: { from: "reviewer note", heading: "A note", tone: "grey" },
  },
  declined: {
    status: { label: "Not approved", tone: "grey" },
    rows: ["title", "service date", "reference"],
    box: { from: "reviewer note", heading: "What would help", tone: "grey" },
  },
  cleared: {
    status: { label: "Cleared to show", tone: "green" },
    rows: ["title", "service date", "requester name", "reviewer name", "reference"],
    box: { from: "reviewer note", heading: "A note", tone: "grey" },
  },
};

const FONT = "Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

function designAHtml(email: {
  accent: string;
  preheader: string;
  status: { label: string; tone: Tone };
  title: string;
  paragraphs: string[];
  rows: { label: string; value: string }[];
  box: { heading: string; text: string; tone: Tone } | null;
  button: { label: string; url: string } | null;
  iconUrl: string;
  footer: string;
  appName: string;
}): string {
  const status = TONES[email.status.tone];
  const paragraphs = email.paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 14px;font-size:16px;line-height:1.6;color:#4f4b63;">${escapeHtml(p).replaceAll("\n", "<br>")}</p>`,
    )
    .join("");
  const rows = email.rows
    .map(
      (row, i) =>
        `<tr><td style="padding:10px 0;border-top:1px solid #efedf5;${i === email.rows.length - 1 ? "border-bottom:1px solid #efedf5;" : ""}font-size:14px;color:#67637b;width:34%;">${escapeHtml(row.label)}</td><td style="padding:10px 0;border-top:1px solid #efedf5;${i === email.rows.length - 1 ? "border-bottom:1px solid #efedf5;" : ""}font-size:14px;font-weight:600;color:#16141f;">${escapeHtml(row.value)}</td></tr>`,
    )
    .join("");
  const box = email.box
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0 0;"><tr><td style="background:${TONES[email.box.tone].bg};border-radius:12px;padding:14px 16px;font-size:14px;line-height:1.55;color:#16141f;"><div style="font-size:13px;font-weight:600;color:${TONES[email.box.tone].ink};margin:0 0 4px;">${escapeHtml(email.box.heading)}</div>${escapeHtml(email.box.text).replaceAll("\n", "<br>")}</td></tr></table>`
    : "";
  const button = email.button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 0;"><tr><td style="border-radius:999px;background:${email.accent};"><a href="${escapeHtml(email.button.url)}" style="display:inline-block;padding:13px 24px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:999px;">${escapeHtml(email.button.label)}</a></td></tr></table>`
    : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(email.title)}</title></head><body style="margin:0;padding:0;background:#eceaf2;font-family:${FONT};"><div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(email.preheader)}</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eceaf2;"><tr><td align="center" style="padding:28px 12px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;"><tr><td style="padding:20px 32px;border-bottom:1px solid #efedf5;"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="vertical-align:middle;"><img src="${escapeHtml(email.iconUrl)}" width="28" height="28" alt="" style="display:block;border:0;border-radius:7px;"></td><td style="vertical-align:middle;padding-left:10px;font-size:14px;font-weight:600;color:#16141f;">${escapeHtml(email.appName)}</td></tr></table></td></tr><tr><td style="padding:28px 32px 30px;"><span style="display:inline-block;padding:5px 12px;border-radius:999px;background:${status.bg};color:${status.ink};font-size:13px;font-weight:600;">${escapeHtml(email.status.label)}</span><h1 style="margin:16px 0 14px;font-size:24px;line-height:1.25;font-weight:700;color:#16141f;">${escapeHtml(email.title)}</h1>${paragraphs}${rows ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 0;">${rows}</table>` : ""}${box}${button}</td></tr><tr><td style="padding:16px 32px;background:#faf9fc;font-size:12px;line-height:1.5;color:#67637b;">${escapeHtml(email.footer)}<br>${escapeHtml(email.appName)}</td></tr></table></td></tr></table></body></html>`;
}
