import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { DepartmentIcon } from "@/components/department-icon";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { getAdminAccess } from "@/lib/data/admin/access";
import { listDepartmentSettings } from "@/lib/data/admin/departments";
import { formatDateTime } from "@/lib/domain/admin";
import {
  departmentHueVar,
  type DepartmentStatus,
  type EnrolmentMode,
} from "@/lib/domain/departments";

const STATUS_LABELS: Record<DepartmentStatus, string> = {
  active: "Active",
  coming_soon: "Coming soon",
  inactive: "Inactive",
};
const STATUS_TONES: Record<DepartmentStatus, StatusTone> = {
  active: "success",
  coming_soon: "info",
  inactive: "neutral",
};
const ENROLMENT_LABELS: Record<EnrolmentMode, string> = {
  request: "Volunteers request to join",
  invite_only: "By invitation only",
};
import { AccessDenied } from "../access-denied";
import { PageSkeleton } from "../page-skeleton";
import { DepartmentForm } from "./department-form";

export const metadata: Metadata = { title: "Departments" };

export default function DepartmentsPage() {
  return (
    <Suspense fallback={<PageSkeleton label="Loading departments…" />}>
      <DepartmentsContent />
    </Suspense>
  );
}

async function DepartmentsContent() {
  const { allowed } = await getAdminAccess("departments");
  if (!allowed) {
    return <AccessDenied />;
  }
  const departments = await listDepartmentSettings();

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-title font-semibold">Departments</h1>
        <p className="max-w-2xl text-text-secondary">
          Open, pause, or rename a department. Changes take effect straight away and are recorded in
          the audit log. Nobody&apos;s training history changes.
        </p>
      </header>
      <ul className="divide-y divide-border border-y border-border">
        {departments.map((department) => (
          <li
            key={department.id}
            style={{ "--dept": departmentHueVar(department.hue) } as CSSProperties}
          >
            <details className="group">
              <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 py-3 hover:bg-hover [&::-webkit-details-marker]:hidden">
                <span className="text-[var(--dept)]">
                  <DepartmentIcon icon={department.icon} className="size-5" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-4">
                  <span className="font-medium">{department.name}</span>
                  <span className="truncate text-small text-text-muted">
                    {ENROLMENT_LABELS[department.enrolmentMode]}
                    {department.curriculumRequiresReview ? " · review before publishing" : ""}
                  </span>
                </span>
                <StatusBadge tone={STATUS_TONES[department.status]}>
                  {STATUS_LABELS[department.status]}
                </StatusBadge>
                <span className="w-10 text-right text-small text-accent-light group-open:hidden">
                  Edit
                </span>
                <span className="hidden w-10 text-right text-small text-text-secondary group-open:inline">
                  Close
                </span>
              </summary>
              <section
                aria-label={`Edit ${department.name}`}
                className="flex max-w-2xl flex-col gap-4 pt-2 pb-6 pl-8"
              >
                <p className="text-small text-text-muted">
                  Last changed {formatDateTime(department.updatedAt)}
                </p>
                <DepartmentForm department={department} />
              </section>
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}
