import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ActionForm, Field, fieldClasses } from "@/components/ui/action-form";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { getAdminAccess } from "@/lib/data/admin/access";
import { listChecklists } from "@/lib/data/checklists";
import { getTeamDepartments } from "@/lib/data/teams";
import { AccessDenied } from "../access-denied";
import { PageSkeleton } from "../page-skeleton";
import { createChecklistAction } from "./actions";

export const metadata: Metadata = { title: "Pre-service checklists" };

export default function ChecklistsPage() {
  return (
    <Suspense fallback={<PageSkeleton label="Loading checklists…" />}>
      <ChecklistsContent />
    </Suspense>
  );
}

/** Pre-service checklists (decision record 9, stage 2): one per kind of position. */
async function ChecklistsContent() {
  const { grants, allowed } = await getAdminAccess("checklists");
  if (!allowed) {
    return <AccessDenied />;
  }
  const [items, departments] = await Promise.all([
    listChecklists(grants),
    getTeamDepartments(grants, "checklist.manage"),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Pre-service checklists"
        description="What each position does before and after a service. People see their own checklist first on the day, and can tick as they go."
      />
      <nav aria-label="Checklist tools" className="flex flex-wrap gap-4 text-small font-medium">
        <Link
          href="/admin/checklists/activity"
          className="text-accent-light underline-offset-4 hover:underline"
        >
          Activity log
        </Link>
      </nav>

      {items.length === 0 ? (
        <EmptyState title="No checklists yet">
          Add one below, then paste in its tasks. One per kind of position works well, such as
          Camera Operators or Audio Engineer.
        </EmptyState>
      ) : (
        <ul className="flex max-w-3xl flex-col divide-y divide-border rounded-card border border-border">
          {items.map((checklist) => (
            <li key={checklist.id}>
              <Link
                href={`/admin/checklists/${checklist.id}`}
                className="flex min-h-touch flex-col gap-1 px-4 py-3 hover:bg-card"
              >
                <span className="font-medium text-text">{checklist.name}</span>
                <span className="text-small text-text-muted">
                  {checklist.departmentName} · {checklist.items}{" "}
                  {checklist.items === 1 ? "item" : "items"}
                  {checklist.positionNames.length > 0
                    ? ` · For ${checklist.positionNames.join(", ")}`
                    : " · Not linked to a position yet"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {departments.length > 0 ? (
        <section
          aria-labelledby="new-checklist-heading"
          className="flex max-w-2xl flex-col gap-4 rounded-card border border-dashed border-border p-5"
        >
          <h2 id="new-checklist-heading" className="text-subheading font-semibold">
            Add a checklist
          </h2>
          <ActionForm
            action={createChecklistAction}
            submitLabel="Add checklist"
            pendingLabel="Adding…"
          >
            <Field id="checklist-name" label="Name">
              <input
                id="checklist-name"
                name="name"
                required
                maxLength={80}
                placeholder="Camera Operators"
                className={fieldClasses}
              />
            </Field>
            <Field id="checklist-department" label="Department">
              <select id="checklist-department" name="departmentId" className={fieldClasses}>
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </select>
            </Field>
          </ActionForm>
        </section>
      ) : null}
    </div>
  );
}
