import type { ReactNode } from "react";
import { DepartmentChips } from "@/components/ui/department-chips";
import type { Metadata } from "next";
import { Suspense } from "react";
import { buttonClasses } from "@/components/ui/button";
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
import { getCourseProgress } from "@/lib/data/course-progress";
import { hasCapability } from "@/lib/domain/capabilities";
import { CourseProgress } from "./course-progress";

export const metadata: Metadata = { title: "Reports" };

export default function ReportsPage({ searchParams }: PageProps<"/admin/reports">) {
  return (
    <Suspense fallback={<PageSkeleton label="Loading reports…" />}>
      <ReportsContent searchParams={searchParams} />
    </Suspense>
  );
}

const REPORTS = ["training", "progress", "readiness", "matrix"] as const;
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
  const query = await searchParams;
  const report: Report = REPORTS.find((r) => r === query.report) ?? "training";
  const departments = await getReportDepartments(grants, { includeTopics: report === "progress" });
  const department = departments.find((d) => d.id === query.department) ?? departments[0] ?? null;
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
              <DepartmentChips
                departments={departments}
                currentId={department.id}
                hrefFor={(id) => `/admin/reports?department=${id}&report=${report}`}
              />
            ) : (
              <p className="font-medium">{department.name}</p>
            )}
            {department.canExport && report !== "matrix" ? (
              <a
                href={`/admin/reports/export?department=${department.id}&report=${report}${
                  report === "progress" && typeof query.course === "string"
                    ? `&course=${query.course}`
                    : ""
                }`}
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
              { href: href("progress"), label: "Course progress", current: report === "progress" },
              { href: href("readiness"), label: "Readiness", current: report === "readiness" },
              {
                href: href("matrix"),
                label: "Readiness matrix",
                current: report === "matrix",
              },
            ]}
          />
          {report === "progress" ? (
            <CourseProgressReport
              departmentId={department.id}
              courseId={typeof query.course === "string" ? query.course : null}
              canMentor={
                !department.isTopic && hasCapability(grants, "mentoring.assign", department.id)
              }
            />
          ) : report === "training" ? (
            <ReportRows load={getTrainingReport(department.id)} Table={TrainingTable} />
          ) : report === "readiness" ? (
            <ReportRows load={getReadinessReport(department.id)} Table={ReadinessTable} />
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

async function CourseProgressReport({
  departmentId,
  courseId,
  canMentor,
}: {
  departmentId: string;
  courseId: string | null;
  canMentor: boolean;
}) {
  const { courses, view } = await getCourseProgress(departmentId, courseId);
  if (!view) {
    return (
      <EmptyState title="No course progress yet">
        This shows once a course here is published and someone can take it.
      </EmptyState>
    );
  }
  return (
    <CourseProgress
      key={view.courseId}
      courses={courses}
      view={view}
      departmentId={departmentId}
      canMentor={canMentor}
    />
  );
}

/** The database hands back at most this many rows at a time, so say so if a report reaches it. */
const LIST_LIMIT = 1000;

async function ReportRows<Row>({
  load,
  Table,
}: {
  load: Promise<Row[]>;
  Table: (props: { rows: Row[] }) => ReactNode;
}) {
  const rows = await load;
  return (
    <>
      <TooLong rows={rows} />
      <Table rows={rows} />
    </>
  );
}

function groupByPerson(rows: TrainingRow[]) {
  const people = new Map<string, { userId: string; name: string; courses: TrainingRow[] }>();
  for (const row of rows) {
    const person = people.get(row.userId);
    if (person) {
      person.courses.push(row);
    } else {
      people.set(row.userId, { userId: row.userId, name: row.name, courses: [row] });
    }
  }
  return [...people.values()];
}

function TooLong({ rows }: { rows: readonly unknown[] }) {
  return rows.length >= LIST_LIMIT ? (
    <p role="status" className="text-small text-warning">
      Showing the first {LIST_LIMIT.toLocaleString("en-CA")} rows. Download the CSV for the rest.
    </p>
  ) : null;
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
      <table className="stack-table w-full min-w-[40rem] text-left text-small">
        <caption className="sr-only">Course completion by volunteer</caption>
        <thead className="border-b border-border text-text-secondary">
          <tr>
            <th scope="col" className="px-4 py-3 font-medium">
              Volunteer and course
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              State
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              Certificate
            </th>
          </tr>
        </thead>
        {groupByPerson(rows).map(({ userId, name, courses }) => (
          <tbody key={userId} className="border-t border-border first-of-type:border-t-0">
            <tr className="bg-card">
              <th scope="colgroup" colSpan={3} className="px-4 py-2 font-medium">
                {name}
              </th>
            </tr>
            {courses.map((row) => (
              <tr key={row.courseId} className="border-t border-border">
                <th scope="row" className="px-4 py-2 font-normal">
                  Level {row.level} · {row.courseTitle}
                </th>
                <td data-label="State" className="px-4 py-2">
                  {COURSE_REPORT_LABELS[row.state]}
                </td>
                <td data-label="Certificate" className="px-4 py-2 font-mono text-text-muted">
                  {row.certificate ?? "None"}
                </td>
              </tr>
            ))}
          </tbody>
        ))}
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
      <table className="stack-table w-full min-w-[40rem] text-left text-small">
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
              <td data-label="Competency or role" className="px-4 py-3">
                {row.item}
                <span className="text-text-muted">
                  {row.kind === "role" ? " (serving role)" : " (competency)"}
                </span>
              </td>
              <td data-label="State" className="px-4 py-3">
                {READINESS_REPORT_LABELS[row.state]}
              </td>
              <td data-label="Since" className="px-4 py-3 text-text-muted">
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
