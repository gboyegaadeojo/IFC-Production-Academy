import type { ReactNode } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ActionForm } from "@/components/ui/action-form";
import {
  CalendarRangeIcon,
  CheckIcon,
  ClockIcon,
  FileTextIcon,
  GraduationCapIcon,
  UserCheckIcon,
  UsersIcon,
} from "@/components/ui/icons";
import { LoadingStatus, Skeleton } from "@/components/ui/skeleton";
import { requireActiveUser } from "@/lib/data/auth";
import {
  getMyEmailPreferences,
  getMyNotifications,
  offersLeadingChoices,
  type AppNotification,
} from "@/lib/data/notifications";
import { formatDateTime } from "@/lib/domain/admin";
import {
  emailChoiceGroups,
  NOTIFICATION_KINDS,
  relativeTime,
  type NotificationKind,
} from "@/lib/domain/notifications";
import { markAllReadAction } from "./actions";
import { EmailChoices } from "./email-choices";

export const metadata: Metadata = { title: "Notifications" };

export default function NotificationsPage() {
  return (
    <Suspense fallback={<NotificationsSkeleton />}>
      <NotificationsContent />
    </Suspense>
  );
}

/**
 * What's happened for you, beside which kinds also come by email (SRS-NOTIF-001, -002; approved
 * mock, 2026-11-01).
 */
async function NotificationsContent() {
  const user = await requireActiveUser();
  const [notifications, preferences, leads] = await Promise.all([
    getMyNotifications(user.id),
    getMyEmailPreferences(user.id),
    offersLeadingChoices(user.id),
  ]);
  const unread = notifications.filter((n) => !n.read).length;
  // A kind with no saved choice is on.
  const initial = Object.fromEntries(
    NOTIFICATION_KINDS.map((kind) => [kind, preferences.get(kind) ?? true]),
  ) as Record<NotificationKind, boolean>;
  const now = new Date();

  return (
    <div className="page-container flex flex-col gap-8 py-8 lg:py-12">
      <header className="flex flex-col gap-2">
        <p className="eyebrow">Account</p>
        <h1 className="text-display font-semibold">Notifications</h1>
        <p className="max-w-[40rem] text-lead text-text-secondary">
          Updates about your training and serving. Everything shows here; choose what also comes by
          email.
        </p>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <section
          aria-labelledby="recent-heading"
          className="rounded-card border border-border bg-surface"
        >
          <div className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
            <h2 id="recent-heading" className="font-semibold">
              Recent
            </h2>
            {unread > 0 ? (
              <ActionForm
                action={markAllReadAction}
                submitLabel="Mark all read"
                pendingLabel="Saving…"
                variant="secondary"
                className="flex"
              />
            ) : null}
          </div>
          {notifications.length === 0 ? (
            <p className="px-5 py-6 text-small text-text-secondary">
              Nothing yet. You&apos;ll see updates here, like being scheduled or an assessment
              result.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {notifications.map((notification) => (
                <li key={notification.id}>
                  <FeedItem notification={notification} now={now} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <EmailChoices groups={emailChoiceGroups(leads)} initial={initial} />
      </div>
    </div>
  );
}

const KIND_ICON: Record<
  NotificationKind,
  { icon: (p: { className?: string }) => ReactNode; tone: string }
> = {
  assignment_scheduled: { icon: CalendarRangeIcon, tone: "text-warning" },
  serving_reminder: { icon: CalendarRangeIcon, tone: "text-warning" },
  cover_requested: { icon: UsersIcon, tone: "text-warning" },
  schedule_update: { icon: CalendarRangeIcon, tone: "text-warning" },
  assessment_recorded: { icon: CheckIcon, tone: "text-success" },
  competency_expiring: { icon: ClockIcon, tone: "text-warning" },
  membership_approved: { icon: GraduationCapIcon, tone: "text-accent-light" },
  learning_nudge: { icon: GraduationCapIcon, tone: "text-accent-light" },
  mentoring_paired: { icon: UsersIcon, tone: "text-accent-light" },
  assessment_requested: { icon: UserCheckIcon, tone: "text-accent-light" },
  sop_review_due: { icon: FileTextIcon, tone: "text-text-secondary" },
  onboarding_task: { icon: UserCheckIcon, tone: "text-warning" },
  onboarding_update: { icon: UsersIcon, tone: "text-accent-light" },
};

function FeedItem({ notification, now }: { notification: AppNotification; now: Date }) {
  const { icon: Icon, tone } = KIND_ICON[notification.kind];
  return (
    <Link
      href={notification.link ?? "/notifications"}
      className="grid min-h-touch grid-cols-[2.25rem_minmax(0,1fr)_auto] items-start gap-3 px-5 py-3.5 transition-surface hover:bg-card"
    >
      <span
        className={`flex size-9 items-center justify-center rounded-pill border border-border bg-card ${tone}`}
      >
        <Icon className="size-4" />
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="flex items-center gap-2">
          {notification.read ? null : (
            <span aria-hidden="true" className="size-2 shrink-0 rounded-pill bg-accent-light" />
          )}
          <span className={notification.read ? "text-text" : "font-semibold text-text"}>
            {notification.read ? "" : <span className="sr-only">Unread: </span>}
            {notification.title}
          </span>
        </span>
        {notification.body ? (
          <span className="text-small text-text-secondary">{notification.body}</span>
        ) : null}
      </span>
      <time
        dateTime={notification.createdAt}
        title={formatDateTime(notification.createdAt)}
        className="text-small whitespace-nowrap text-text-muted"
      >
        <span aria-hidden="true">{relativeTime(notification.createdAt, now)}</span>
        <span className="sr-only">{formatDateTime(notification.createdAt)}</span>
      </time>
    </Link>
  );
}

function NotificationsSkeleton() {
  return (
    <div className="page-container flex flex-col gap-8 py-8 lg:py-12" aria-busy="true">
      <LoadingStatus label="Loading notifications…" />
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-12 w-72 max-w-full" />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-72" />
        <Skeleton className="h-96" />
      </div>
    </div>
  );
}
