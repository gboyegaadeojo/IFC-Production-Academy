import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ActionForm, Field } from "@/components/ui/action-form";
import { fieldClasses } from "@/components/ui/field-classes";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { getAdminAccess } from "@/lib/data/admin/access";
import { getSchedulingSource } from "@/lib/data/planning-center";
import { getNoteHeadings, getPlanTemplate } from "@/lib/data/plans";
import { AccessDenied } from "../../../access-denied";
import { PageSkeleton } from "../../../page-skeleton";
import { PlanEditor } from "../../plan-editor";
import {
  archiveTemplateAction,
  duplicateTemplateAction,
  savePlanTemplateAction,
} from "../../plan-actions";

export const metadata: Metadata = { title: "Plan template" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function PlanTemplatePage({ params }: { params: Promise<{ templateId: string }> }) {
  return (
    <Suspense fallback={<PageSkeleton label="Loading the plan template…" />}>
      <PlanTemplateContent params={params} />
    </Suspense>
  );
}

/** One saved order of service. Changing it never changes services already planned. */
async function PlanTemplateContent({ params }: { params: Promise<{ templateId: string }> }) {
  const { allowed } = await getAdminAccess("schedule");
  if (!allowed) {
    return <AccessDenied />;
  }
  const { templateId } = await params;
  if (!UUID.test(templateId)) {
    notFound();
  }
  const [template, headings, source] = await Promise.all([
    getPlanTemplate(templateId),
    getNoteHeadings(),
    getSchedulingSource(),
  ]);
  if (!template) {
    notFound();
  }
  const academy = source === "academy";

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <Breadcrumbs
          items={[
            { label: "Plan templates", href: "/admin/schedule/templates" },
            { label: template.name },
          ]}
        />
        <h1 className="text-title font-semibold">{template.name}</h1>
        <p className="max-w-2xl text-text-secondary">
          Changing this template never changes services already planned. New services, and services
          you switch to it, start with it.
        </p>
      </header>

      {academy ? (
        <>
          <section aria-labelledby="items-heading" className="flex max-w-4xl flex-col gap-3">
            <h2 id="items-heading" className="text-heading font-semibold">
              Items
            </h2>
            <PlanEditor
              initialItems={template.items}
              headings={headings}
              action={savePlanTemplateAction}
              hidden={{ templateId: template.id }}
              submitLabel="Save template"
            >
              <Field id="template-name" label="Name">
                <input
                  id="template-name"
                  name="name"
                  required
                  maxLength={80}
                  defaultValue={template.name}
                  className={fieldClasses}
                />
              </Field>
            </PlanEditor>
          </section>

          <section className="flex max-w-3xl flex-wrap gap-3">
            <ActionForm
              action={duplicateTemplateAction}
              submitLabel="Duplicate"
              pendingLabel="Copying…"
              variant="secondary"
              hidden={{ templateId: template.id }}
              className="flex"
            />
            <ActionForm
              action={archiveTemplateAction}
              submitLabel="Archive template"
              pendingLabel="Archiving…"
              variant="destructive"
              hidden={{ templateId: template.id }}
              className="flex"
            />
          </section>
        </>
      ) : (
        <p className="max-w-2xl text-small text-text-secondary">
          Plan templates are edited while the Academy schedules. Planning Center schedules right
          now.
        </p>
      )}
    </div>
  );
}
