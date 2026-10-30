import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { DepartmentIcon } from "@/components/department-icon";
import { getAdminAccess } from "@/lib/data/admin/access";
import { listDepartmentSettings } from "@/lib/data/admin/departments";
import { formatDateTime } from "@/lib/domain/admin";
import { departmentHueVar } from "@/lib/domain/departments";
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
      <ul className="flex flex-col gap-5">
        {departments.map((department) => (
          <li
            key={department.id}
            className="rounded-card border border-border bg-card p-6"
            style={{ "--dept": departmentHueVar(department.hue) } as CSSProperties}
          >
            <section aria-labelledby={`dept-${department.id}`} className="flex flex-col gap-5">
              <div className="flex items-center gap-3">
                <span className="flex size-11 items-center justify-center rounded-button border border-[var(--dept)] text-[var(--dept)]">
                  <DepartmentIcon icon={department.icon} />
                </span>
                <div>
                  <h2 id={`dept-${department.id}`} className="text-subheading font-semibold">
                    {department.name}
                  </h2>
                  <p className="text-small text-text-muted">
                    Last changed {formatDateTime(department.updatedAt)}
                  </p>
                </div>
              </div>
              <DepartmentForm department={department} />
            </section>
          </li>
        ))}
      </ul>
    </div>
  );
}
