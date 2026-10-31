/**
 * Notifications (SRS-NOTIF-001..006). Labels, and the email built from a notification. No
 * imports, so the scheduled email job (scripts/send-notifications.ts) can run this file directly.
 */

export type NotificationKind =
  | "membership_approved"
  | "assignment_scheduled"
  | "assessment_recorded"
  | "mentoring_paired"
  | "sop_review_due"
  | "serving_reminder"
  | "learning_nudge"
  | "assessment_requested"
  | "competency_expiring";

export const NOTIFICATION_KINDS: readonly NotificationKind[] = [
  "assignment_scheduled",
  "serving_reminder",
  "learning_nudge",
  "assessment_recorded",
  "competency_expiring",
  "membership_approved",
  "mentoring_paired",
  "assessment_requested",
  "sop_review_due",
];

export const NOTIFICATION_KIND_LABELS: Record<NotificationKind, string> = {
  assignment_scheduled: "When I'm scheduled to serve",
  serving_reminder: "Reminders to confirm, and two days before I serve",
  learning_nudge: "A nudge when a course I started has gone quiet",
  assessment_recorded: "When a practical assessment is recorded for me",
  competency_expiring: "When an approval is about to expire",
  membership_approved: "When I join a department",
  mentoring_paired: "When I'm paired for mentoring",
  assessment_requested: "When someone is ready for an assessment I can record",
  sop_review_due: "When an SOP I own is due or overdue for review",
};

const WINNIPEG_HOUR = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Winnipeg",
  hour: "numeric",
  hourCycle: "h23",
});

/**
 * Quiet hours (decision 8): no notification email between 20:00 and 08:00 Winnipeg time. Anything
 * queued overnight goes out at 08:00. Sign-in links aren't affected: Supabase sends them directly.
 */
export function isQuietHours(now: Date): boolean {
  // Read the hour field itself: the formatted string differs between runtimes ("07" or "7 a.m.").
  const part = WINNIPEG_HOUR.formatToParts(now).find((p) => p.type === "hour");
  const hour = Number(part?.value) % 24;
  return hour >= 20 || hour < 8;
}

export function isNotificationKind(value: string): value is NotificationKind {
  return Object.hasOwn(NOTIFICATION_KIND_LABELS, value);
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** The link only ever points inside the Academy. */
export function notificationUrl(siteUrl: string, link: string | null): string {
  const base = siteUrl.replace(/\/+$/, "");
  return link && /^\/[A-Za-z0-9/_.?=&-]*$/.test(link) ? `${base}${link}` : `${base}/notifications`;
}

/** The email for one notification: plain text and simple HTML, with how to turn it off. */
export function notificationEmail(
  notification: { title: string; body: string; link: string | null },
  siteUrl: string,
): { subject: string; text: string; html: string } {
  const url = notificationUrl(siteUrl, notification.link);
  const settings = notificationUrl(siteUrl, "/notifications");
  const subject = `IFC Production Academy: ${notification.title}`.slice(0, 200);
  const text = [
    notification.title,
    "",
    notification.body,
    "",
    `Open the Academy: ${url}`,
    "",
    `You can choose which emails you get at ${settings}`,
  ].join("\n");
  const html = [
    `<p><strong>${escapeHtml(notification.title)}</strong></p>`,
    notification.body ? `<p>${escapeHtml(notification.body)}</p>` : "",
    `<p><a href="${escapeHtml(url)}">Open the Academy</a></p>`,
    `<p style="color:#666;font-size:12px">You can choose which emails you get on your <a href="${escapeHtml(settings)}">notifications page</a>.</p>`,
  ].join("");
  return { subject, text, html };
}
