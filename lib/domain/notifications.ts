import { calmEmailHtml } from "./email-design.ts";

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
  | "competency_expiring"
  | "cover_requested"
  | "schedule_update"
  | "onboarding_task"
  | "onboarding_update"
  | "course_assigned"
  | "service_changed"
  | "join_requested"
  | "cover_open"
  | "approved_to_serve"
  | "certificate_ready"
  | "new_course"
  | "sop_updated"
  | "mentor_note"
  | "role_granted";

/** These stay in the app, so there's nothing to choose (decision 2026-11-05). */
export const APP_ONLY_KINDS: readonly NotificationKind[] = [
  "certificate_ready",
  "new_course",
  "sop_updated",
];

export const NOTIFICATION_KINDS: readonly NotificationKind[] = [
  "assignment_scheduled",
  "serving_reminder",
  "cover_requested",
  "schedule_update",
  "course_assigned",
  "learning_nudge",
  "assessment_recorded",
  "competency_expiring",
  "membership_approved",
  "mentoring_paired",
  "assessment_requested",
  "sop_review_due",
  "onboarding_task",
  "onboarding_update",
  "service_changed",
  "join_requested",
  "cover_open",
  "approved_to_serve",
  "mentor_note",
  "role_granted",
  ...APP_ONLY_KINDS,
];

export const NOTIFICATION_KIND_LABELS: Record<NotificationKind, string> = {
  assignment_scheduled: "When I'm scheduled to serve",
  serving_reminder: "Reminders to confirm, two days before I serve, and that morning",
  cover_requested: "When a teammate asks for someone to cover their spot",
  schedule_update: "When someone covers for me, or changes a schedule I run",
  course_assigned: "When a leader asks me to take a course",
  learning_nudge: "A nudge when a course I started goes quiet",
  assessment_recorded: "When a practical assessment is recorded for me",
  competency_expiring: "When an approval is about to expire",
  membership_approved: "When I join a department",
  mentoring_paired: "When I'm paired for mentoring",
  assessment_requested: "When someone is ready for an assessment I can record",
  sop_review_due: "When an SOP I own is due or overdue for review",
  onboarding_task: "When someone new needs me to follow up",
  onboarding_update: "When someone moves on in onboarding",
  service_changed: "When a service I'm on is moved or cancelled",
  join_requested: "When someone asks to join a department I lead",
  cover_open: "When a spot still needs cover close to the service",
  approved_to_serve: "When I'm approved to serve in a role",
  mentor_note: "When my mentor or mentee shares a note",
  role_granted: "When a leader gives me a role, such as Department Leader",
  certificate_ready: "When a certificate is ready",
  new_course: "When my department has a new course",
  sop_updated: "When an SOP in my department is updated",
};

/** A short note under some email choices, saying where or when it comes from. */
export const NOTIFICATION_KIND_HINTS: Partial<Record<NotificationKind, string>> = {
  assignment_scheduled: "From Planning Center",
  learning_nudge: "After a week with no progress",
  assessment_requested: "Leaders and assessors",
  sop_review_due: "SOP owners",
  onboarding_task: "Leaders who welcome new people",
};

export type NotificationGroup = {
  id: "serving" | "training" | "leading";
  title: string;
  kinds: readonly NotificationKind[];
};

/** Email choices, grouped the way people think about them (approved mock, 2026-11-01). */
export const NOTIFICATION_GROUPS: readonly NotificationGroup[] = [
  {
    id: "serving",
    title: "Serving",
    kinds: [
      "assignment_scheduled",
      "serving_reminder",
      "service_changed",
      "cover_requested",
      "schedule_update",
    ],
  },
  {
    id: "training",
    title: "Training",
    kinds: [
      "membership_approved",
      "course_assigned",
      "learning_nudge",
      "assessment_recorded",
      "approved_to_serve",
      "competency_expiring",
      "mentoring_paired",
      "mentor_note",
    ],
  },
  {
    id: "leading",
    title: "Leading",
    kinds: [
      "role_granted",
      "assessment_requested",
      "join_requested",
      "cover_open",
      "sop_review_due",
      "onboarding_task",
      "onboarding_update",
    ],
  },
];

/** What each group covers, in a line, on the settings page (refinements mock, 2026-11-06). */
export const NOTIFICATION_GROUP_HINTS: Record<NotificationGroup["id"], string> = {
  serving: "Being scheduled, reminders, cover requests, and schedule changes",
  training: "Joining, courses a leader asks you to take, nudges, results, approvals, and mentoring",
  leading:
    "Roles a leader gives you, join requests, people ready for an assessment, SOP reviews, and onboarding follow-ups",
};

export type GroupChoice = "on" | "off" | "some";

/**
 * One switch per group stands for every kind in it (G, 2026-11-06: fewer toggles). It reads "some"
 * when someone fine-tuned the kinds one by one.
 */
export function groupChoice(
  kinds: readonly NotificationKind[],
  choices: Readonly<Record<NotificationKind, boolean>>,
): GroupChoice {
  const on = kinds.filter((kind) => choices[kind]).length;
  return on === kinds.length ? "on" : on === 0 ? "off" : "some";
}

export function isNotificationGroupId(value: string): value is NotificationGroup["id"] {
  return NOTIFICATION_GROUPS.some((group) => group.id === value);
}

/**
 * The groups to offer. Leading choices are only for people who lead or assess, or own an SOP, so
 * volunteers aren't asked about emails they can never get.
 */
export function emailChoiceGroups(leads: boolean): readonly NotificationGroup[] {
  return NOTIFICATION_GROUPS.filter((group) => group.id !== "leading" || leads);
}

/** "now", "5m", "2h", "Yesterday", or a short date, for the Recent list. */
export function relativeTime(iso: string, now: Date): string {
  const then = new Date(iso);
  const minutes = Math.floor((now.getTime() - then.getTime()) / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)}h`;
  const day = (date: Date) => WINNIPEG_DAY.format(date);
  const yesterday = new Date(now.getTime() - 86_400_000);
  if (day(then) === day(yesterday)) return "Yesterday";
  return WINNIPEG_SHORT_DATE.format(then);
}

const WINNIPEG_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Winnipeg",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const WINNIPEG_SHORT_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Winnipeg",
  month: "short",
  day: "numeric",
});

const WINNIPEG_HOUR = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Winnipeg",
  hour: "numeric",
  hour12: false,
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

/** The link only ever points inside the Academy. */
export function notificationUrl(siteUrl: string, link: string | null): string {
  const base = siteUrl.replace(/\/+$/, "");
  return link && /^\/[A-Za-z0-9/_.?=&-]*$/.test(link) ? `${base}${link}` : `${base}/notifications`;
}

/** What the button says for each kind: what it does, not "Open". */
const BUTTON_LABELS: Record<NotificationKind, string> = {
  membership_approved: "Start learning",
  assignment_scheduled: "Confirm or decline",
  assessment_recorded: "See your result",
  mentoring_paired: "Open mentoring",
  sop_review_due: "Review the SOP",
  serving_reminder: "See your schedule",
  learning_nudge: "Continue",
  assessment_requested: "See who's waiting",
  competency_expiring: "See your profile",
  cover_requested: "See the spot",
  schedule_update: "See your schedule",
  onboarding_task: "See the follow-up",
  onboarding_update: "See their progress",
  course_assigned: "Start the course",
  service_changed: "See your schedule",
  join_requested: "Review the request",
  cover_open: "Find someone",
  approved_to_serve: "See your profile",
  certificate_ready: "Get your certificate",
  new_course: "See the course",
  sop_updated: "Read the update",
  mentor_note: "Read the note",
  role_granted: "See what you can do",
};

export function emailButtonLabel(kind: string): string {
  return isNotificationKind(kind) ? BUTTON_LABELS[kind] : "Open the Academy";
}

/**
 * The email for one notification (Calm design, decision 2026-11-05): the title is the subject, the
 * message is the preview line, and one button says what it does. Plain text too, with how to turn
 * emails off.
 */
export function notificationEmail(
  notification: {
    kind?: string;
    title: string;
    body: string;
    link: string | null;
    details?: readonly { label: string; value: string }[] | null;
  },
  siteUrl: string,
  appName = "IFC Production Academy",
): { subject: string; text: string; html: string } {
  const url = notificationUrl(siteUrl, notification.link);
  const settings = notificationUrl(siteUrl, "/notifications/settings");
  const button = emailButtonLabel(notification.kind ?? "");
  const subject = notification.title.slice(0, 200);
  const details = (notification.details ?? []).filter(
    (row) => typeof row?.label === "string" && typeof row?.value === "string",
  );
  const text = [
    notification.title,
    "",
    notification.body,
    ...(details.length > 0 ? ["", ...details.map((row) => `${row.label}: ${row.value}`)] : []),
    "",
    `${button}: ${url}`,
    "",
    `You can choose which emails you get at ${settings}`,
    appName,
  ].join("\n");
  const html = calmEmailHtml({
    preheader: notification.body,
    title: notification.title,
    paragraphs: notification.body ? [notification.body] : [],
    details,
    button: { label: button, url },
    iconUrl: `${siteUrl.replace(/\/+$/, "")}/brand/icon`,
    footer: {
      text: "You can choose which emails you get on your",
      link: { label: "notifications page", url: settings },
    },
    appName,
  });
  return { subject, text, html };
}

/**
 * An onboarding pathway email, as its leader wrote it, in the Calm design. Many people have no
 * account yet, so they can't reach notification settings: they're told to reply instead
 * (decision 7, CASL).
 */
export function onboardingEmail(
  email: { subject: string; body: string; hasAccount: boolean },
  siteUrl: string,
  appName = "IFC Production Academy",
): { subject: string; text: string; html: string } {
  const settings = notificationUrl(siteUrl, "/notifications/settings");
  const footer = email.hasAccount
    ? `You can choose which emails you get at ${settings}`
    : "If you'd rather not get these emails, reply and let us know.";
  const text = [email.body, "", `From ${appName}. ${footer}`].join("\n");
  const paragraphs = email.body
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);
  const html = calmEmailHtml({
    preheader: paragraphs[0] ?? email.subject,
    title: email.subject,
    paragraphs,
    button: null,
    iconUrl: `${siteUrl.replace(/\/+$/, "")}/brand/icon`,
    footer: email.hasAccount
      ? {
          text: "You can choose which emails you get on your",
          link: { label: "notifications page", url: settings },
        }
      : { text: "If you'd rather not get these emails, reply and let us know." },
    appName,
  });
  return { subject: email.subject.slice(0, 200), text, html };
}
