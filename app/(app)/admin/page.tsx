import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { ChevronRightIcon } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/page-header";
import { getAdminAccess } from "@/lib/data/admin/access";
import { getAdminOverview, type AdminOverview } from "@/lib/data/admin/overview";
import { formatDateTime } from "@/lib/domain/admin";
import { AccessDenied } from "./access-denied";
import { PageSkeleton } from "./page-skeleton";

export const metadata: Metadata = { title: "Dashboard" };

export default function AdminDashboardPage() {
  return (
    <Suspense fallback={<PageSkeleton label="Loading the dashboard…" />}>
      <DashboardContent />
    </Suspense>
  );
}

type QueueItem = { label: string; count: number; detail: string; href: string };

/** What needs someone's attention, from real counts only (DESIGN §7.1). */
function queue(overview: AdminOverview): QueueItem[] {
  const items: QueueItem[] = [];
  if (overview.pendingRequests) {
    items.push({
      label: "Membership requests",
      count: overview.pendingRequests,
      detail:
        overview.pendingRequests === 1
          ? "1 person is waiting to join"
          : `${overview.pendingRequests} people are waiting to join`,
      href: "/admin/members",
    });
  }
  if (overview.awaitingReview) {
    items.push({
      label: "Curriculum waiting for review",
      count: overview.awaitingReview,
      detail: "Submitted changes that need a second person to publish",
      href: "/admin/curriculum",
    });
  }
  if (overview.draftsInProgress) {
    items.push({
      label: "Unpublished curriculum drafts",
      count: overview.draftsInProgress,
      detail: "Drafts volunteers can't see until they're published",
      href: "/admin/curriculum",
    });
  }
  return items;
}

async function DashboardContent() {
  const { grants, allowed } = await getAdminAccess("overview");
  if (!allowed) {
    return <AccessDenied />;
  }
  const overview = await getAdminOverview(grants);
  const attention = queue(overview);

  const metrics = [
    overview.activeInvitations !== null
      ? {
          label: "Open invitations",
          value: overview.activeInvitations,
          note: "Links that can still be used",
          href: "/admin/invitations",
        }
      : null,
    overview.people
      ? {
          label: "People",
          value: overview.people.total,
          note:
            overview.people.notActive === 0
              ? "All accounts active"
              : `${overview.people.notActive} suspended or deactivated`,
          href: "/admin/people",
        }
      : null,
    overview.departments
      ? {
          label: "Active departments",
          value: overview.departments.active,
          note:
            [
              overview.departments.comingSoon
                ? `${overview.departments.comingSoon} coming soon`
                : null,
              overview.departments.inactive ? `${overview.departments.inactive} inactive` : null,
            ]
              .filter(Boolean)
              .join(" · ") || "None waiting to open",
          href: "/admin/departments",
        }
      : null,
  ].filter((metric) => metric !== null);

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        eyebrow="Admin"
        title="Dashboard"
        description="What needs your attention across the departments you look after."
      />

      <section aria-labelledby="attention-heading" className="flex flex-col gap-3">
        <h2 id="attention-heading" className="text-heading font-semibold">
          Needs attention
        </h2>
        {attention.length === 0 ? (
          <EmptyState title="You're all caught up">
            No requests are waiting and no curriculum is waiting on you. New items appear here as
            they come in.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-border rounded-card border border-border">
            {attention.map((item) => (
              <li key={item.label}>
                <Link
                  href={item.href}
                  className="group flex min-h-touch items-center gap-4 px-4 py-4 transition-surface hover:bg-card"
                >
                  <span className="tabular flex min-w-12 justify-center rounded-pill border border-warning/60 px-2 py-0.5 font-mono text-small text-text">
                    {item.count}
                  </span>
                  <span className="flex flex-1 flex-col">
                    <span className="font-medium">{item.label}</span>
                    <span className="text-small text-text-secondary">{item.detail}</span>
                  </span>
                  <ChevronRightIcon className="size-4 text-text-muted group-hover:text-text" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {metrics.length > 0 ? (
        <section aria-labelledby="metrics-heading" className="flex flex-col gap-3">
          <h2 id="metrics-heading" className="text-heading font-semibold">
            At a glance
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {metrics.map((metric) => (
              <li key={metric.label}>
                <Link
                  href={metric.href}
                  className="flex h-full flex-col gap-1 rounded-card border border-border bg-card p-5 transition-surface hover:border-border-strong"
                >
                  <span className="text-small text-text-secondary">{metric.label}</span>
                  <span className="tabular text-title font-semibold">{metric.value}</span>
                  <span className="text-small text-text-muted">{metric.note}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {overview.recentActivity ? (
        <section aria-labelledby="activity-heading" className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-4">
            <h2 id="activity-heading" className="text-heading font-semibold">
              Recent activity
            </h2>
            <Link
              href="/admin/audit"
              className="text-small text-accent-light underline-offset-4 hover:underline"
            >
              Full audit log
            </Link>
          </div>
          {overview.recentActivity.length === 0 ? (
            <EmptyState title="Nothing recorded yet">
              Sensitive changes, such as roles, memberships, and publishing, appear here.
            </EmptyState>
          ) : (
            <ol className="divide-y divide-border rounded-card border border-border">
              {overview.recentActivity.map((entry) => (
                <li
                  key={entry.id}
                  className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6"
                >
                  <span className="text-small">
                    <span className="font-medium text-text">
                      {entry.actor ? entry.actor.displayName : "System"}
                    </span>{" "}
                    <span className="text-text-secondary">{entry.description.toLowerCase()}</span>
                    {entry.subject ? (
                      <span className="text-text-secondary"> · {entry.subject.displayName}</span>
                    ) : null}
                  </span>
                  <time dateTime={entry.createdAt} className="shrink-0 text-small text-text-muted">
                    {formatDateTime(entry.createdAt)}
                  </time>
                </li>
              ))}
            </ol>
          )}
        </section>
      ) : null}
    </div>
  );
}
