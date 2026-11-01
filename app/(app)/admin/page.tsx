import type { CSSProperties, ReactNode } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { DepartmentIcon } from "@/components/department-icon";
import { EmptyState } from "@/components/ui/empty-state";
import {
  ArrowRightIcon,
  GraduationCapIcon,
  QuizIcon,
  UserCheckIcon,
  UsersIcon,
} from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { getAdminAccess } from "@/lib/data/admin/access";
import { getAdminOverview, type TrainingSummary } from "@/lib/data/admin/overview";
import { getCurrentUser } from "@/lib/data/auth";
import { formatDateTime } from "@/lib/domain/admin";
import { needsYou, pipelineSegments, type NeedsYouItem } from "@/lib/domain/dashboard";
import { departmentHueVar } from "@/lib/domain/departments";
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

const NEEDS_ICON: Record<
  NeedsYouItem["key"],
  { icon: (p: { className?: string }) => ReactNode; tile: string }
> = {
  assessments: { icon: UserCheckIcon, tile: "bg-tile-green text-tile-green-ink" },
  requests: { icon: UsersIcon, tile: "bg-tile-blue text-tile-blue-ink" },
  review: { icon: QuizIcon, tile: "bg-tile-violet text-tile-violet-ink" },
  drafts: { icon: GraduationCapIcon, tile: "bg-tile-orange text-tile-orange-ink" },
};

/**
 * Admin dashboard (DESIGN §7.1; redesign approved 2026-11-01). What needs you first, then one table
 * that reads left to right from joining to serving, then the totals and recent activity. Every
 * figure is a real count limited to the departments you look after; course completion and
 * approval to serve stay separate (SPEC §3).
 */
async function DashboardContent() {
  const { grants, allowed } = await getAdminAccess("overview");
  if (!allowed) {
    return <AccessDenied />;
  }
  const [overview, me] = await Promise.all([getAdminOverview(grants), getCurrentUser()]);
  const items = needsYou({
    awaitingAssessment: overview.training
      ? overview.training.reduce((sum, d) => sum + d.awaitingAssessment, 0)
      : null,
    pendingRequests: overview.pendingRequests,
    awaitingReview: overview.awaitingReview,
    drafts: overview.drafts,
  });

  const glance = [
    overview.people
      ? {
          label: "People with an account",
          value: overview.people.total,
          note:
            overview.people.notActive === 0
              ? "all active"
              : `${overview.people.notActive} suspended or deactivated`,
          href: "/admin/people",
        }
      : null,
    overview.activeInvitations !== null
      ? {
          label: "Invitation links still open",
          value: overview.activeInvitations,
          note: null,
          href: "/admin/invitations",
        }
      : null,
    overview.departments
      ? {
          label: "Departments open",
          value: overview.departments.active,
          note:
            [
              overview.departments.comingSoon
                ? `${overview.departments.comingSoon} coming soon`
                : null,
              overview.departments.inactive ? `${overview.departments.inactive} inactive` : null,
            ]
              .filter(Boolean)
              .join(" · ") || null,
          href: "/admin/departments",
        }
      : null,
  ].filter((row) => row !== null);

  return (
    <div className="flex flex-col gap-9">
      <PageHeader
        eyebrow="Administration"
        title="Dashboard"
        description="What needs you today, then how each department's volunteers are moving from joining to serving."
      />

      {items.length > 0 ? (
        <section aria-labelledby="needs-heading" className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h2 id="needs-heading" className="text-heading font-semibold">
              Needs you
            </h2>
            <p className="text-small text-text-secondary">
              Things only you can move forward. Each one opens the page where you do it.
            </p>
          </div>
          <ul className="grid gap-3.5 md:grid-cols-2 xl:grid-cols-3">
            {items.map((item) => (
              <li key={item.key} className="flex">
                <NeedsYouCard item={item} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {overview.training && overview.training.length > 0 ? (
        <section aria-labelledby="training-heading" className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h2 id="training-heading" className="text-heading font-semibold">
              Training, by department
            </h2>
            <p className="text-small text-text-secondary">
              Read each row left to right: people join, learn, get checked, then serve. Each number
              counts people. Finishing courses never approves anyone to serve on its own.
            </p>
          </div>
          <TrainingTable rows={overview.training} />
        </section>
      ) : null}

      {glance.length > 0 || overview.recentActivity ? (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          {glance.length > 0 ? (
            <section
              aria-labelledby="glance-heading"
              className="rounded-card border border-border bg-surface"
            >
              <h2
                id="glance-heading"
                className="border-b border-border px-4 py-3.5 text-subheading font-semibold"
              >
                At a glance
              </h2>
              <ul className="divide-y divide-border">
                {glance.map((row) => (
                  <li key={row.label}>
                    <Link
                      href={row.href}
                      className="flex min-h-touch items-center justify-between gap-3 px-4 py-2.5 transition-surface hover:bg-hover"
                    >
                      <span className="text-text-secondary">{row.label}</span>
                      <span className="tabular font-semibold">
                        {row.value}
                        {row.note ? (
                          <span className="font-normal text-text-muted"> · {row.note}</span>
                        ) : null}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {overview.recentActivity ? (
            <section
              aria-labelledby="activity-heading"
              className="rounded-card border border-border bg-surface"
            >
              <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3.5">
                <h2 id="activity-heading" className="text-subheading font-semibold">
                  Recent activity
                </h2>
                <Link
                  href="/admin/audit"
                  className="text-small font-medium text-accent-light underline-offset-4 hover:underline"
                >
                  Full audit log
                </Link>
              </div>
              {overview.recentActivity.length === 0 ? (
                <p className="px-4 py-5 text-small text-text-secondary">
                  Nothing recorded yet. Sensitive changes, such as roles, memberships, and
                  publishing, appear here.
                </p>
              ) : (
                <ol className="divide-y divide-border">
                  {overview.recentActivity.map((entry) => (
                    <li
                      key={entry.id}
                      className="flex flex-col gap-0.5 px-4 py-2.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6"
                    >
                      <span>
                        <span className="font-medium text-text">
                          {entry.actor
                            ? entry.actor.id === me?.id
                              ? "You"
                              : entry.actor.displayName
                            : "System"}
                        </span>
                        <span className="text-text-secondary">
                          {" · "}
                          {entry.description}
                          {entry.subject ? ` · ${entry.subject.displayName}` : ""}
                        </span>
                      </span>
                      <time
                        dateTime={entry.createdAt}
                        className="shrink-0 text-small text-text-muted"
                      >
                        {formatDateTime(entry.createdAt)}
                      </time>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          ) : null}
        </div>
      ) : null}

      {items.length === 0 && !overview.training && glance.length === 0 ? (
        <EmptyState title="Nothing to show yet">
          The areas you look after don&apos;t have a summary here yet. Use the menu to open them.
        </EmptyState>
      ) : null}
    </div>
  );
}

function NeedsYouCard({ item }: { item: NeedsYouItem }) {
  const { icon: Icon, tile } = NEEDS_ICON[item.key];
  const clear = item.count === 0;
  return (
    <article
      aria-labelledby={`needs-${item.key}`}
      className={`flex w-full flex-col gap-2.5 rounded-card border border-border p-4 ${
        clear ? "bg-card" : "bg-surface shadow-[0_8px_24px_-14px_rgba(22,20,31,0.18)]"
      }`}
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className={`flex size-9 items-center justify-center rounded-button ${
            clear ? "bg-tile-grey text-tile-grey-ink" : tile
          }`}
        >
          <Icon className="size-[18px]" />
        </span>
        <span
          className={`tabular text-[1.625rem] leading-none font-semibold tracking-tight ${clear ? "text-text-muted" : "text-text"}`}
        >
          {item.count}
        </span>
      </div>
      <h3 id={`needs-${item.key}`} className="font-semibold">
        {item.title}
      </h3>
      <p className="text-small text-text-secondary">{item.detail}</p>
      {clear ? null : (
        <Link
          href={item.href}
          className="mt-auto inline-flex min-h-control w-fit items-center gap-1.5 rounded-button border border-border-strong px-3 text-small font-medium transition-surface hover:bg-hover"
        >
          {item.action}
          <span className="sr-only">: {item.title}</span>
          <ArrowRightIcon className="size-4" />
        </Link>
      )}
    </article>
  );
}

const SEGMENTS = [
  { key: "approved", label: "Approved to serve", className: "bg-success" },
  { key: "waiting", label: "Waiting for assessment", className: "bg-warning" },
  { key: "learning", label: "Learning", className: "bg-accent" },
  { key: "joined", label: "Joined, not started", className: "bg-accent/30" },
] as const;

/** One row per department, joining to serving; the bar repeats the numbers, never replaces them. */
function TrainingTable({ rows }: { rows: TrainingSummary[] }) {
  const cell = "px-4 py-3 align-middle";
  const number = `${cell} tabular text-right`;
  return (
    <div className="overflow-hidden rounded-card border border-border bg-surface">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[46rem] border-collapse text-left">
          <caption className="sr-only">Training, by department</caption>
          <thead>
            <tr className="border-b border-border text-small text-text-muted">
              <th scope="col" className={`${cell} font-medium`}>
                Department
              </th>
              <Th label="Members" note="Can take the training" />
              <Th label="Learning" note="Started a course" />
              <Th label="Waiting" note="Asked for an assessment" />
              <Th label="Approved to serve" note="In at least one role" />
              <Th label="Certificates" note="Courses finished" />
              <th scope="col" className={`${cell} font-medium`}>
                <span className="sr-only">Progress</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => {
              const style = { "--dept": departmentHueVar(row.hue) } as CSSProperties;
              const name = (
                <span className="flex items-center gap-2.5 font-semibold">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-[8px] bg-hover text-[var(--dept)]">
                    <DepartmentIcon icon={row.icon} className="size-4" />
                  </span>
                  {row.departmentName}
                </span>
              );
              if (row.comingSoon) {
                return (
                  <tr key={row.departmentId} style={style} className="text-text-muted">
                    <th scope="row" className={`${cell} font-normal`}>
                      {name}
                    </th>
                    <td colSpan={6} className={cell}>
                      <span className="flex items-center gap-2 text-small">
                        <StatusBadge tone="info">Coming soon</StatusBadge>
                        Not open to volunteers yet.
                      </span>
                    </td>
                  </tr>
                );
              }
              const segments = pipelineSegments(row);
              return (
                <tr key={row.departmentId} style={style}>
                  <th scope="row" className={`${cell} font-normal`}>
                    {name}
                  </th>
                  <Num className={number} value={row.activeMembers} />
                  <Num className={number} value={row.inProgress} />
                  <td className={number}>
                    <span className={row.awaitingAssessment ? "font-semibold" : "text-text-muted"}>
                      {row.awaitingAssessment}
                    </span>
                    {row.furtherPractice ? (
                      <span className="block text-small text-text-muted">
                        {row.furtherPractice} need another go
                      </span>
                    ) : null}
                  </td>
                  <Num className={number} value={row.approvedToServe} />
                  <Num className={number} value={row.certificates} />
                  <td className={`${cell} w-40`}>
                    <span
                      aria-hidden="true"
                      className="flex h-2 w-full min-w-28 overflow-hidden rounded-pill bg-hover"
                    >
                      {SEGMENTS.map((segment) =>
                        segments[segment.key] > 0 ? (
                          <span
                            key={segment.key}
                            className={`h-full ${segment.className}`}
                            style={{ width: `${segments[segment.key]}%` }}
                          />
                        ) : null,
                      )}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ul
        aria-label="Bar colours"
        className="flex flex-wrap gap-x-4 gap-y-1.5 border-t border-border px-4 py-3 text-small text-text-secondary"
      >
        {SEGMENTS.map((segment) => (
          <li key={segment.key} className="flex items-center gap-1.5">
            <span aria-hidden="true" className={`size-2.5 rounded-[3px] ${segment.className}`} />
            {segment.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Th({ label, note }: { label: string; note: string }) {
  return (
    <th scope="col" className="px-4 py-3 text-right align-bottom font-medium">
      {label}
      <span className="block text-[0.6875rem] font-normal">{note}</span>
    </th>
  );
}

function Num({ value, className }: { value: number; className: string }) {
  return (
    <td className={className}>
      <span className={value ? "font-semibold" : "text-text-muted"}>{value}</span>
    </td>
  );
}
