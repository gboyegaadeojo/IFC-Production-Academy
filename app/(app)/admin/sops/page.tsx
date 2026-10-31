import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ActionForm, Field, fieldClasses } from "@/components/ui/action-form";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { getAdminAccess } from "@/lib/data/admin/access";
import { getSopDepartments, getSopsForStaff, sopTitle } from "@/lib/data/sops";
import { formatDate } from "@/lib/domain/dates";
import { SOP_STATE_LABELS } from "@/lib/domain/sops";
import { AccessDenied } from "../access-denied";
import { PageSkeleton } from "../page-skeleton";
import { createSopAction } from "./actions";

export const metadata: Metadata = { title: "SOP library" };

export default function AdminSopsPage() {
  return (
    <Suspense fallback={<PageSkeleton label="Loading SOPs…" />}>
      <AdminSopsContent />
    </Suspense>
  );
}

/** SOP library for the people who look after it (SRS-SOP-001..004): every SOP and its state. */
async function AdminSopsContent() {
  const { grants, allowed } = await getAdminAccess("sops");
  if (!allowed) {
    return <AccessDenied />;
  }
  const departments = await getSopDepartments(grants);
  const all = await getSopsForStaff(departments.map((d) => d.id));
  const drafting = departments.filter((d) => d.canDraft);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="SOP library"
        description="Procedures for the departments you look after. Publish a new version when something changes, and confirm each SOP is still right when its review comes up."
      />

      {drafting.length > 0 ? (
        <section className="flex max-w-2xl flex-col gap-3 rounded-card border border-dashed border-border p-5">
          <h2 className="text-subheading font-semibold">Add an SOP</h2>
          <ActionForm
            action={createSopAction}
            submitLabel="Create SOP"
            pendingLabel="Creating…"
            variant="secondary"
            className="flex flex-col gap-3"
          >
            <Field id="new-sop-title" label="SOP title">
              <input
                id="new-sop-title"
                name="title"
                required
                maxLength={120}
                className={fieldClasses}
              />
            </Field>
            <Field id="new-sop-department" label="Department">
              <select
                id="new-sop-department"
                name="departmentId"
                defaultValue={drafting[0]?.id}
                className={fieldClasses}
              >
                {drafting.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </Field>
          </ActionForm>
        </section>
      ) : null}

      {departments.map((department) => {
        const list = all.filter((sop) => sop.department.id === department.id);
        return (
          <section
            key={department.id}
            aria-labelledby={`sops-${department.id}`}
            className="flex flex-col gap-3"
          >
            <h2 id={`sops-${department.id}`} className="text-heading font-semibold">
              {department.name}
            </h2>
            {list.length === 0 ? (
              <EmptyState title="No SOPs yet">
                Add the department&apos;s procedures here, then attach them to lessons.
              </EmptyState>
            ) : (
              <ul className="flex flex-col divide-y divide-border rounded-card border border-border">
                {list.map((sop) => (
                  <li
                    key={sop.id}
                    className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex flex-col">
                      <Link
                        href={`/admin/sops/${sop.id}`}
                        className="font-medium text-accent-light underline-offset-4 hover:underline"
                      >
                        {sopTitle(sop)}
                      </Link>
                      <span className="text-small text-text-muted">
                        {[
                          sop.category || null,
                          sop.current ? `Version ${sop.current.versionNumber}` : null,
                          sop.lastReviewedAt ? `Reviewed ${formatDate(sop.lastReviewedAt)}` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <StatusBadge tone={sop.state === "current" ? "success" : "pending"}>
                        {SOP_STATE_LABELS[sop.state]}
                      </StatusBadge>
                      {sop.draft && sop.state !== "not_published" ? (
                        <StatusBadge tone="pending">Changes in a draft</StatusBadge>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
