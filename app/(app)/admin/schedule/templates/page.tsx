import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ActionForm, Field, fieldClasses } from "@/components/ui/action-form";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { getAdminAccess } from "@/lib/data/admin/access";
import { getSchedulingSource } from "@/lib/data/planning-center";
import { listPlanTemplates } from "@/lib/data/plans";
import { listServiceTypes } from "@/lib/data/service-types";
import { formatLength, planTimeline } from "@/lib/domain/plan";
import { AccessDenied } from "../../access-denied";
import { PageSkeleton } from "../../page-skeleton";
import { createTemplateAction } from "../plan-actions";
import { ScheduleTabs } from "../schedule-tabs";

export const metadata: Metadata = { title: "Plan templates" };

export default function PlanTemplatesPage() {
  return (
    <Suspense fallback={<PageSkeleton label="Loading plan templates…" />}>
      <PlanTemplatesContent />
    </Suspense>
  );
}

/** Saved orders of service (plan "Academy scheduling", PR 6). */
async function PlanTemplatesContent() {
  const { allowed } = await getAdminAccess("schedule");
  if (!allowed) {
    return <AccessDenied />;
  }
  const [templates, types, source] = await Promise.all([
    listPlanTemplates(),
    listServiceTypes(),
    getSchedulingSource(),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Plan templates"
        description="Saved orders of service. Each service type has a usual one, and any service can use any template."
      />
      <ScheduleTabs current="templates" />

      {templates.length === 0 ? (
        <EmptyState title="No plan templates yet">
          Add one below, or save a service&apos;s order of service as a template.
        </EmptyState>
      ) : (
        <ul className="grid max-w-4xl gap-3 sm:grid-cols-2">
          {templates.map((template) => {
            const usual = types.filter((type) => type.defaultTemplateId === template.id);
            return (
              <li key={template.id}>
                <Link
                  href={`/admin/schedule/templates/${template.id}`}
                  className="flex h-full flex-col gap-1 rounded-card border border-border bg-surface p-4 hover:border-accent"
                >
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="font-medium">{template.name}</span>
                    <span className="text-small text-text-muted tabular-nums">
                      {formatLength(planTimeline(template.items).totalSeconds)}
                    </span>
                  </span>
                  <span className="text-small text-text-secondary">
                    {template.items.length === 1 ? "1 item" : `${template.items.length} items`}
                    {usual.length > 0
                      ? ` · Usual plan for ${usual.map((type) => type.name).join(", ")}`
                      : ""}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {source === "academy" ? (
        <section
          aria-labelledby="new-template-heading"
          className="flex max-w-xl flex-col gap-3 rounded-card border border-border p-5"
        >
          <h2 id="new-template-heading" className="text-heading font-semibold">
            Add a plan template
          </h2>
          <ActionForm
            action={createTemplateAction}
            submitLabel="Add template"
            pendingLabel="Adding…"
            className="flex flex-wrap items-end gap-3"
          >
            <Field id="new-template-name" label="Name">
              <input
                id="new-template-name"
                name="name"
                required
                maxLength={80}
                placeholder="Standard Sunday"
                className={fieldClasses}
              />
            </Field>
          </ActionForm>
        </section>
      ) : null}
    </div>
  );
}
