import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ActionForm } from "@/components/ui/action-form";
import { NotificationIcon } from "@/components/notification-icon";
import { ChevronRightIcon, SettingsIcon } from "@/components/ui/icons";
import Loading from "./loading";
import { requireActiveUser } from "@/lib/data/auth";
import { getMyNotifications, type AppNotification } from "@/lib/data/notifications";
import { formatDateTime } from "@/lib/domain/admin";
import { emailButtonLabel, relativeTime } from "@/lib/domain/notifications";
import { markAllReadAction } from "./actions";

export const metadata: Metadata = { title: "Notifications" };

export default function NotificationsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <NotificationsContent />
    </Suspense>
  );
}

/**
 * Everything that's happened for you (SRS-NOTIF-001). The bell's panel shows the newest; this is
 * the full list. Phone and email choices are on their own page (refinements, 2026-11-06).
 */
async function NotificationsContent() {
  const user = await requireActiveUser();
  const notifications = await getMyNotifications(user.id);
  const unread = notifications.filter((n) => !n.read).length;
  const now = new Date();

  return (
    <div className="page-container flex max-w-[44rem] flex-col gap-6 py-6 lg:py-10">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-title font-semibold">Notifications</h1>
        <Link
          href="/notifications/settings"
          className="flex min-h-touch items-center gap-2 rounded-pill px-3 text-small font-semibold text-text-secondary transition-surface hover:bg-hover hover:text-text"
        >
          <SettingsIcon className="size-4" />
          Notification settings
        </Link>
      </header>

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
          ) : notifications.length > 0 ? (
            <p className="text-small text-text-muted">Everything is read</p>
          ) : null}
        </div>
        {notifications.length === 0 ? (
          <p className="px-5 py-6 text-small text-text-secondary">
            Nothing yet. You&apos;ll see updates here, like being scheduled or an assessment result.
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
    </div>
  );
}

function FeedItem({ notification, now }: { notification: AppNotification; now: Date }) {
  return (
    <Link
      href={notification.link ?? "/notifications"}
      className="grid min-h-touch grid-cols-[2.25rem_minmax(0,1fr)_auto] items-start gap-3 px-5 py-3.5 transition-surface hover:bg-card"
    >
      <NotificationIcon kind={notification.kind} />
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
        <span className="mt-0.5 flex items-center gap-1 text-small font-semibold text-accent-light">
          {emailButtonLabel(notification.kind)}
          <ChevronRightIcon className="size-3.5" />
        </span>
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
