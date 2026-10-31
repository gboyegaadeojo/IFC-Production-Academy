import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ActionForm } from "@/components/ui/action-form";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { LoadingStatus, Skeleton } from "@/components/ui/skeleton";
import { requireActiveUser } from "@/lib/data/auth";
import { getMyEmailPreferences, getMyNotifications } from "@/lib/data/notifications";
import { formatDateTime } from "@/lib/domain/admin";
import { NOTIFICATION_KIND_LABELS, NOTIFICATION_KINDS } from "@/lib/domain/notifications";
import { markAllReadAction, saveEmailPreferencesAction } from "./actions";

export const metadata: Metadata = { title: "Notifications" };

export default function NotificationsPage() {
  return (
    <Suspense fallback={<NotificationsSkeleton />}>
      <NotificationsContent />
    </Suspense>
  );
}

/** What's happened for you, and which kinds also come by email (SRS-NOTIF-001, -002). */
async function NotificationsContent() {
  const user = await requireActiveUser();
  const [notifications, preferences] = await Promise.all([
    getMyNotifications(user.id),
    getMyEmailPreferences(user.id),
  ]);
  const unread = notifications.filter((n) => !n.read).length;

  return (
    <div className="page-container flex flex-col gap-10 py-8 lg:py-12">
      <PageHeader title="Notifications" description="Updates about your training and serving." />

      <section aria-labelledby="recent-heading" className="flex max-w-3xl flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="recent-heading" className="text-heading font-semibold">
            Recent
          </h2>
          {unread > 0 ? (
            <ActionForm
              action={markAllReadAction}
              submitLabel="Mark all as read"
              pendingLabel="Saving…"
              variant="tertiary"
              className="flex"
            />
          ) : null}
        </div>
        {notifications.length === 0 ? (
          <EmptyState title="Nothing yet">
            You&apos;ll see updates here, like being scheduled or an assessment result.
          </EmptyState>
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-card border border-border">
            {notifications.map((notification) => (
              <li key={notification.id}>
                <Link
                  href={notification.link ?? "/notifications"}
                  className="flex min-h-touch flex-col gap-1 px-4 py-3 hover:bg-card"
                >
                  <span className="flex items-center gap-2">
                    {notification.read ? null : (
                      <span aria-hidden="true" className="size-2 shrink-0 rounded-pill bg-accent" />
                    )}
                    <span className={notification.read ? "text-text" : "font-semibold text-text"}>
                      {notification.read ? "" : <span className="sr-only">Unread: </span>}
                      {notification.title}
                    </span>
                  </span>
                  {notification.body ? (
                    <span className="text-small text-text-secondary">{notification.body}</span>
                  ) : null}
                  <span className="text-small text-text-muted">
                    {formatDateTime(notification.createdAt)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="email-heading" className="flex max-w-3xl flex-col gap-3">
        <h2 id="email-heading" className="text-heading font-semibold">
          Email me
        </h2>
        <p className="text-small text-text-secondary">
          Everything shows here in the Academy. Choose what also comes to your inbox.
        </p>
        <ActionForm action={saveEmailPreferencesAction} submitLabel="Save email choices">
          <fieldset className="flex flex-col gap-1">
            <legend className="sr-only">Email me</legend>
            {NOTIFICATION_KINDS.map((kind) => (
              <label key={kind} className="flex min-h-control items-center gap-3">
                <input type="hidden" name="kind" value={kind} />
                <input
                  type="checkbox"
                  name="email"
                  value={kind}
                  defaultChecked={preferences.get(kind) ?? true}
                  className="size-5 accent-accent"
                />
                {NOTIFICATION_KIND_LABELS[kind]}
              </label>
            ))}
          </fieldset>
        </ActionForm>
      </section>
    </div>
  );
}

function NotificationsSkeleton() {
  return (
    <div className="page-container flex flex-col gap-8 py-8 lg:py-12" aria-busy="true">
      <LoadingStatus label="Loading notifications…" />
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-48 max-w-3xl" />
    </div>
  );
}
