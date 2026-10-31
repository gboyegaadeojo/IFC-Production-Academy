import type { Metadata } from "next";
import { Suspense } from "react";
import { fieldClasses } from "@/components/ui/action-form";
import { Button, buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs } from "@/components/ui/tabs";
import { getAdminAccess } from "@/lib/data/admin/access";
import {
  getReadinessMatrix,
  getReadinessReport,
  getReportDepartments,
  getTrainingReport,
  type MatrixRow,
  type ReadinessRow,
  type TrainingRow,
} from "@/lib/data/reports";
import { formatDate } from "@/lib/domain/dates";
import { COURSE_REPORT_LABELS, READINESS_REPORT_LABELS } from "@/lib/domain/reports";
import { AccessDenied } from "../access-denied";
import { PageSkeleton } from "../page-skeleton";

export const metadata: Metadata = { title: "Reports" };

export default function ReportsPage({ searchParams }: PageProps<"/admin/reports">) {
  return (
    <Suspense fallback={<PageSkeleton label="Loading reports…" />}>
      <ReportsContent searchParams={searchParams} />
    </Suspense>
  );
}

const REPORTS = ["training", "readiness", "matrix"] as const;
type Report = (typeof REPORTS)[number];

/**
 * Department reports (SRS-REPORT-001..007). Training shows course completion; Readiness shows
 * competencies and Approved to Serve. They're separate on purpose (SPEC §3).
 */
async function ReportsContent({ searchParams }: Pick<PageProps<"/admin/reports">, "searchParams">) {
  const { grants, allowed } = await getAdminAccess("reports");
  if (!allowed) {
    return <AccessDenied />;
  }
  const departments = await getReportDepartments(grants);
  const query = await searchParams;
  const department = departments.find((d) => d.id === query.department) ?? departments[0] ?? null;
  const report: Report = REPORTS.find((r) => r === query.report) ?? "training";
  const href = (next: Report) =>
    `/admin/reports?department=${department?.id ?? ""}${next === "training" ? "" : `&report=${next}`}`;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Reports"
        description="Where each volunteer is. Course completion, competencies, and Approved to Serve are reported separately, because finishing a course never approves anyone to serve."
      />
      {!department ? (
        <EmptyState title="No departments to report on">
          Reports cover departments where you can view training reports.
        </EmptyState>
      ) : (
        <>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            {departments.length > 1 ? (
              <form className="flex flex-wrap items-end gap-3">
                <input type="hidden" name="report" value={report} />
                <div className="flex flex-col gap-2">
                  <label
                    htmlFor="report-department"
                    className="text-small font-medium text-text-secondary"
                  >
                    Department
                  </label>
                  <select
                    id="report-department"
                    name="department"
                    defaultValue={department.id}
                    className={fieldClasses}
                  >
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
                <Button type="submit" variant="secondary">
                  Show
                </Button>
              </form>
            ) : (
              <p className="font-medium">{department.name}</p>
            )}
            {department.canExport && report !== "matrix" ? (
              <a
                href={`/admin/reports/export?department=${department.id}&report=${report}`}
                className={buttonClasses("secondary", "w-fit")}
                download
              >
                Download CSV<span className="sr-only"> of the {report} report</span>
              </a>
            ) : null}
          </div>
          <Tabs
            label="Report"
            tabs={[
              { href: href("training"), label: "Training", current: report === "training" },
              { href: href("readiness"), label: "Readiness", current: report === "readiness" },
              {
                href: href("matrix"),
                label: "Readiness matrix",
                current: report === "matrix",
              },
            ]}
          />
          {report === "training" ? (
            <TrainingTable rows={await getTrainingReport(department.id)} />
          ) : report === "readiness" ? (
            <ReadinessTable rows={await getReadinessReport(department.id)} />
          ) : (
            <MatrixTable rows={await getReadinessMatrix()} />
          )}
          {department.canExport ? (
            <p className="text-small text-text-muted">
              Downloads are recorded in the audit log. They include names and training records only,
              never contact details or mentoring notes.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

function TrainingTable({ rows }: { rows: TrainingRow[] }) {
  if (rows.length === 0) {
    return (
      <EmptyState title="Nothing to report yet">
        This shows once the department has active members and a published course.
      </EmptyState>
    );
  }
  return (
    <div className="overflow-x-auto rounded-card border border-border">
      <table className="w-full min-w-[40rem] text-left text-small">
        <caption className="sr-only">Course completion by volunteer</caption>
        <thead className="border-b border-border text-text-secondary">
          <tr>
            <th scope="col" className="px-4 py-3 font-medium">
              Volunteer
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              Course
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              State
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              Certificate
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => (
            <tr key={`${row.userId}-${row.courseId}`}>
              <th scope="row" className="px-4 py-3 font-medium">
                {row.name}
              </th>
              <td className="px-4 py-3">
                Level {row.level} · {row.courseTitle}
              </td>
              <td className="px-4 py-3">{COURSE_REPORT_LABELS[row.state]}</td>
              <td className="px-4 py-3 font-mono text-text-muted">{row.certificate ?? "None"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReadinessTable({ rows }: { rows: ReadinessRow[] }) {
  if (rows.length === 0) {
    return (
      <EmptyState title="Nothing to report yet">
        This shows once the department has active members and competencies or serving roles.
      </EmptyState>
    );
  }
  return (
    <div className="overflow-x-auto rounded-card border border-border">
      <table className="w-full min-w-[40rem] text-left text-small">
        <caption className="sr-only">Competencies and Approved to Serve by volunteer</caption>
        <thead className="border-b border-border text-text-secondary">
          <tr>
            <th scope="col" className="px-4 py-3 font-medium">
              Volunteer
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              Competency or role
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              State
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              Since
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => (
            <tr key={`${row.userId}-${row.kind}-${row.item}`}>
              <th scope="row" className="px-4 py-3 font-medium">
                {row.name}
              </th>
              <td className="px-4 py-3">
                {row.item}
                <span className="text-text-muted">
                  {row.kind === "role" ? " (serving role)" : " (competency)"}
                </span>
              </td>
              <td className="px-4 py-3">{READINESS_REPORT_LABELS[row.state]}</td>
              <td className="px-4 py-3 text-text-muted">
                {row.since ? formatDate(row.since) : "—"}
                {row.expiresAt ? ` · expires ${formatDate(row.expiresAt)}` : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Approved to Serve per role across the departments the person can report on (ADD-REPORT-01).
 * Roles with fewer than two approved people are marked, SPEC §9's candidate goal.
 */
function MatrixTable({ rows }: { rows: MatrixRow[] }) {
  if (rows.length === 0) {
    return (
      <EmptyState title="No serving roles yet">
        Set up serving roles in Competencies and roles to see who is ready for each.
      </EmptyState>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-card border border-border">
        <table className="w-full min-w-[32rem] text-left text-small">
          <caption className="sr-only">Approved to Serve by department and role</caption>
          <thead className="border-b border-border text-text-secondary">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">
                Department
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Serving role
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Approved to serve
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={row.roleId}>
                <td className="px-4 py-3">{row.departmentName}</td>
                <th scope="row" className="px-4 py-3 font-medium">
                  {row.roleName}
                </th>
                <td className="px-4 py-3">
                  <span className="tabular">{row.approved}</span>
                  {row.approved < 2 ? (
                    <span className="text-text-muted"> · fewer than two</span>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-small text-text-muted">
        Aim for at least two approved people in every role, so one absence doesn&apos;t leave a gap.
      </p>
    </div>
  );
}
