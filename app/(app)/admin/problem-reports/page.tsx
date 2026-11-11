import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ActionForm } from "@/components/ui/action-form";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { getAdminAccess } from "@/lib/data/admin/access";
import { listProblemReports } from "@/lib/data/problem-reports";
import { reportedAtLabel } from "@/lib/domain/problem-reports";
import { AccessDenied } from "../access-denied";
import { PageSkeleton } from "../page-skeleton";
import { setReportStatusAction } from "./actions";

export const metadata: Metadata = { title: "Problem reports" };

type Props = PageProps<"/admin/problem-reports">;

export default function ProblemReportsPage({ searchParams }: Props) {
  return (
    <Suspense fallback={<PageSkeleton label="Loading reports…" />}>
      <ProblemReportsContent searchParams={searchParams} />
    </Suspense>
  );
}

/**
 * What people sent with Report a problem (health check follow-up, G 2026-11-11). Platform admins
 * get a notification for each one, and mark them sorted here; each change is in the audit log.
 */
async function ProblemReportsContent({ searchParams }: Pick<Props, "searchParams">) {
  const { allowed } = await getAdminAccess("problem-reports");
  if (!allowed) {
    return <AccessDenied />;
  }
  const { show } = await searchParams;
  const all = show === "all";
  const reports = await listProblemReports(all);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex max-w-2xl flex-col gap-3">
          <h1 className="text-title font-semibold">Problem reports</h1>
          <p className="text-text-secondary">
            What people sent with Report a problem, in their account menu. Platform admins get a
            notification for each one.
          </p>
        </div>
        <nav
          aria-label="Show"
          className="grid grid-cols-2 gap-1 rounded-card border border-border-strong bg-card p-1"
        >
          {(
            [
              ["open", "Open", "/admin/problem-reports"],
              ["all", "All", "/admin/problem-reports?show=all"],
            ] as const
          ).map(([value, label, href]) => {
            const on = (value === "all") === all;
            return (
              <Link
                key={value}
                href={href}
                aria-current={on ? "page" : undefined}
                className={`flex min-h-touch items-center justify-center rounded-button px-5 text-small font-semibold transition-surface ${
                  on ? "bg-accent text-on-accent" : "text-text hover:bg-hover"
                }`}
              >
                {label}
              </Link>
            );
          })}
        </nav>
      </header>

      {reports.length === 0 ? (
        <EmptyState title={all ? "No reports yet" : "Nothing open"}>
          {all
            ? "When someone uses Report a problem, it shows here."
            : "Every report has been sorted."}
        </EmptyState>
      ) : (
        <ul className="flex max-w-3xl flex-col gap-3">
          {reports.map((report) => {
            const sorted = report.status === "sorted";
            return (
              <li
                key={report.id}
                className="grid grid-cols-1 gap-3 rounded-card border border-border bg-surface p-4 sm:grid-cols-[minmax(0,1fr)_auto]"
              >
                <div className="flex min-w-0 flex-col gap-1.5">
                  <p className="font-medium break-words whitespace-pre-line">{report.message}</p>
                  <p className="text-small text-text-muted">
                    {report.reporterName} · {reportedAtLabel(report.createdAt)}
                    {sorted && report.sortedByName ? ` · sorted by ${report.sortedByName}` : ""}
                  </p>
                  <ul aria-label="Sent with the report" className="mt-1 flex flex-wrap gap-1.5">
                    {[
                      report.page ? `Page: ${report.page}` : null,
                      report.device || null,
                      report.appVersion ? `Version ${report.appVersion}` : null,
                    ]
                      .filter((fact): fact is string => fact !== null)
                      .map((fact) => (
                        <li
                          key={fact}
                          className="rounded-pill bg-hover px-2.5 py-0.5 text-small text-text-secondary"
                        >
                          {fact}
                        </li>
                      ))}
                  </ul>
                </div>
                <div className="flex items-center gap-3 sm:flex-col sm:items-end">
                  <StatusBadge tone={sorted ? "success" : "pending"}>
                    {sorted ? "Sorted" : "Open"}
                  </StatusBadge>
                  <ActionForm
                    action={setReportStatusAction}
                    hidden={{ id: report.id, sorted: sorted ? "false" : "true" }}
                    submitLabel={sorted ? "Reopen" : "Mark as sorted"}
                    pendingLabel="Saving…"
                    variant="secondary"
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
