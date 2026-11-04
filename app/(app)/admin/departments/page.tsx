import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { DepartmentIcon } from "@/components/department-icon";
import { Drawer } from "@/components/ui/drawer";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { getAdminAccess } from "@/lib/data/admin/access";
import { listDepartmentSettings, type DepartmentSettings } from "@/lib/data/admin/departments";
import { formatDateTime } from "@/lib/domain/admin";
import {
  departmentHueVar,
  type DepartmentStatus,
  type EnrolmentMode,
} from "@/lib/domain/departments";

const STATUS_LABELS: Record<DepartmentStatus, string> = {
  active: "Active",
  coming_soon: "Coming soon",
  inactive: "Hidden",
};
const STATUS_TONES: Record<DepartmentStatus, StatusTone> = {
  active: "success",
  coming_soon: "info",
  inactive: "neutral",
};
const ENROLMENT_LABELS: Record<EnrolmentMode, string> = {
  request: "They ask, a leader approves",
  open: "Anyone can join",
  invite_only: "By invitation only",
};
import { AccessDenied } from "../access-denied";
import { PageSkeleton } from "../page-skeleton";
import { DepartmentForm } from "./department-form";
import { NewDepartmentForm } from "./new-department-form";

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
  const all = await listDepartmentSettings();
  const departments = all.filter((department) => department.kind === "team");
  const topics = all.filter((department) => department.kind === "topic");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Departments"
        description="Add, open, pause, or rename a department. Changes take effect straight away and are recorded in the audit log. Nobody's training history changes."
      />
      <details className="group max-w-2xl rounded-card border border-border bg-surface p-4">
        <summary className="inline-flex min-h-button cursor-pointer list-none items-center rounded-button bg-accent px-3 text-small font-medium text-on-accent hover:brightness-110 [&::-webkit-details-marker]:hidden">
          + Add a department
        </summary>
        <div className="mt-4 flex flex-col gap-4">
          <p className="text-small text-text-secondary">
            It gets the three levels straight away (Foundations, Proficiency, Advanced and
            Leadership). Then set up its courses in Curriculum, its positions in Competencies and
            roles, its checklist, and its onboarding pathway, as for every other department.
          </p>
          <NewDepartmentForm />
        </div>
      </details>
      <CategoryTable caption="Departments in display order" rows={departments} />

      <section aria-labelledby="topics-heading" className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 id="topics-heading" className="text-heading font-semibold">
            Topics
          </h2>
          <p className="max-w-[44rem] text-small text-text-secondary">
            Courses for anyone on the production team, such as General and Leadership. Nobody joins
            a topic, and it has no positions or practicals.
          </p>
        </div>
        <details className="group max-w-2xl rounded-card border border-border bg-surface p-4">
          <summary className="inline-flex min-h-button cursor-pointer list-none items-center rounded-button border border-border-strong px-3 text-small font-medium text-text hover:bg-hover [&::-webkit-details-marker]:hidden">
            + Add a topic
          </summary>
          <div className="mt-4">
            <NewDepartmentForm kind="topic" />
          </div>
        </details>
        {topics.length > 0 ? (
          <CategoryTable caption="Topics in display order" rows={topics} />
        ) : null}
      </section>
    </div>
  );
}

function CategoryTable({ caption, rows }: { caption: string; rows: DepartmentSettings[] }) {
  const isTopics = rows[0]?.kind === "topic";
  return (
    <div className="relative overflow-x-auto rounded-card border border-border">
      <table className="stack-table w-full min-w-[40rem] text-left text-small">
        <caption className="sr-only">{caption}</caption>
        <thead className="border-b border-border text-text-muted">
          <tr>
            <th scope="col" className="px-4 py-3 font-medium">
              {isTopics ? "Topic" : "Department"}
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              {isTopics ? "Levels" : "How people join"}
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              Status
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((department) => (
            <tr
              key={department.id}
              style={{ "--dept": departmentHueVar(department.hue) } as CSSProperties}
            >
              <td className="px-4 py-3">
                <span className="flex items-center gap-3">
                  <span className="flex size-8 items-center justify-center rounded-button border border-border text-[var(--dept)]">
                    <DepartmentIcon icon={department.icon} className="size-4" />
                  </span>
                  <span className="flex flex-col">
                    <span className="font-medium text-text">{department.name}</span>
                    <span className="text-text-muted">
                      Changed {formatDateTime(department.updatedAt)}
                    </span>
                  </span>
                </span>
              </td>
              <td
                data-label={isTopics ? "Levels" : "How people join"}
                className="px-4 py-3 text-text-secondary"
              >
                {isTopics
                  ? department.usesLevels
                    ? "Three levels"
                    : "No levels"
                  : ENROLMENT_LABELS[department.enrolmentMode]}
              </td>
              <td data-label="Status" className="px-4 py-3">
                <StatusBadge tone={STATUS_TONES[department.status]}>
                  {STATUS_LABELS[department.status]}
                </StatusBadge>
              </td>
              <td className="px-4 py-3 text-right">
                <Drawer
                  title={`Edit ${department.name}`}
                  triggerLabel={` ${department.name}`}
                  trigger={<span className="text-small text-text">Edit</span>}
                  triggerClassName="border border-border-strong"
                  side="right"
                  wide
                >
                  <div className="flex flex-col gap-4 p-2">
                    <p className="text-small text-text-muted">
                      Last changed {formatDateTime(department.updatedAt)}
                    </p>
                    <DepartmentForm department={department} />
                  </div>
                </Drawer>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
