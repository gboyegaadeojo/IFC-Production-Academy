/**
 * The look of every Academy email (G chose "Calm", 2026-11-05; docs/decisions/2026-11-05-alerts.md):
 * centred on a soft grey page, a large title, a short message, one rounded button, and a quiet
 * footer. Tables and inline styles only, because email programs ignore most CSS, and no SVG,
 * because Gmail and Outlook drop it. No imports, so the email job can run this file directly.
 */

const INK = "#1d1d1f";
const MUTED = "#6e6e73";
const QUIET = "#86868b";
const PAGE = "#f5f5f7";
const ACCENT = "#6d3fe0";

/** The system colour for a button, or purple if it isn't a plain #rrggbb (G, 2026-11-13). */
export function buttonColour(accent: string | undefined): string {
  return accent && /^#[0-9a-f]{6}$/i.test(accent) ? accent : ACCENT;
}
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, Helvetica, Arial, sans-serif";

export function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export type CalmEmail = {
  /** Shown in the inbox after the subject. */
  preheader: string;
  title: string;
  /** Paragraphs, as plain text. */
  paragraphs: readonly string[];
  /** A white card of label and value pairs, such as when and where. */
  details?: readonly { label: string; value: string }[];
  button: { label: string; url: string } | null;
  /** The app's icon, an absolute address. */
  iconUrl: string;
  /** Plain text; a link is added after it when given. */
  footer: { text: string; link?: { label: string; url: string } };
  appName: string;
  /** The system colour for the button; purple when left out. */
  accent?: string;
};

/** The whole HTML document for one email. */
export function calmEmailHtml(email: CalmEmail): string {
  const paragraphs = email.paragraphs
    .map(
      (paragraph) =>
        `<p style="margin:0 0 14px;font-size:17px;line-height:1.5;color:${MUTED};">${escapeHtml(
          paragraph,
        ).replaceAll("\n", "<br>")}</p>`,
    )
    .join("");
  const rows = email.details ?? [];
  const details =
    rows.length > 0
      ? `<tr><td style="padding:6px 0 10px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:18px;text-align:left;">${rows
          .map(
            (row, index) =>
              `<tr><td style="padding:12px 0 12px 20px;font-size:15px;color:${MUTED};${index < rows.length - 1 ? "border-bottom:1px solid #ececf0;" : ""}">${escapeHtml(row.label)}</td><td align="right" style="padding:12px 20px 12px 12px;font-size:15px;font-weight:500;color:${INK};${index < rows.length - 1 ? "border-bottom:1px solid #ececf0;" : ""}">${escapeHtml(row.value)}</td></tr>`,
          )
          .join("")}</table></td></tr>`
      : "";
  const button = email.button
    ? `<tr><td align="center" style="padding:14px 0 6px;"><a href="${escapeHtml(email.button.url)}" style="display:inline-block;padding:13px 28px;border-radius:999px;background:${buttonColour(email.accent)};color:#ffffff;font-size:16px;font-weight:500;text-decoration:none;">${escapeHtml(email.button.label)}</a></td></tr>`
    : "";
  const footerLink = email.footer.link
    ? ` <a href="${escapeHtml(email.footer.link.url)}" style="color:${QUIET};text-decoration:underline;">${escapeHtml(email.footer.link.label)}</a>.`
    : "";
  return [
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(email.title)}</title></head>`,
    `<body style="margin:0;padding:0;background:${PAGE};">`,
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(email.preheader)}</div>`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAGE};font-family:${FONT};">`,
    `<tr><td align="center" style="padding:48px 20px;">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;text-align:center;">`,
    `<tr><td align="center" style="padding-bottom:22px;"><img src="${escapeHtml(email.iconUrl)}" width="52" height="52" alt="${escapeHtml(email.appName)}" style="display:block;border:0;border-radius:14px;"></td></tr>`,
    `<tr><td style="padding-bottom:16px;"><h1 style="margin:0;font-size:30px;line-height:1.15;font-weight:600;letter-spacing:-0.02em;color:${INK};">${escapeHtml(email.title)}</h1></td></tr>`,
    `<tr><td>${paragraphs}</td></tr>`,
    details,
    button,
    `<tr><td style="padding-top:30px;font-size:12px;line-height:1.6;color:${QUIET};">${escapeHtml(email.footer.text)}${footerLink}<br>${escapeHtml(email.appName)}</td></tr>`,
    `</table></td></tr></table></body></html>`,
  ].join("");
}
