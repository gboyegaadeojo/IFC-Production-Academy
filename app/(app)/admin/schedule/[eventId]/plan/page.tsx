import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ActionForm, Field } from "@/components/ui/action-form";
import { fieldClasses } from "@/components/ui/field-classes";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { getAdminAccess } from "@/lib/data/admin/access";
import { getSchedulingSource } from "@/lib/data/planning-center";
import { getNoteHeadings, getServicePlan, listPlanTemplates } from "@/lib/data/plans";
import { getEventDetail } from "@/lib/data/schedule";
import { getServiceFiles } from "@/lib/data/service-files";
import { formatLength, PLAN_ITEM_KIND_LABELS, planTimeline } from "@/lib/domain/plan";
import { eventTimeLabel } from "@/lib/domain/schedule";
import { fileSizeLabel, SERVICE_FILE_TYPES } from "@/lib/domain/service-files";
import { AccessDenied } from "../../../access-denied";
import { PageSkeleton } from "../../../page-skeleton";
import { PlanEditor } from "../../plan-editor";
import {
  addServiceFileAction,
  applyTemplateAction,
  removeServiceFileAction,
  savePlanTemplateAction,
  saveServicePlanAction,
} from "../../plan-actions";
import { TimesEditor } from "../../times-editor";

export const metadata: Metadata = { title: "Order of service" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function ServicePlanPage({ params }: { params: Promise<{ eventId: string }> }) {
  return (
    <Suspense fallback={<PageSkeleton label="Loading the order of service…" />}>
      <ServicePlanContent params={params} />
    </Suspense>
  );
}

/**
 * A service's order of service, times, and plan (plan "Academy scheduling", PR 6). While Planning
 * Center schedules, it shows what Planning Center has, read only.
 */
async function ServicePlanContent({ params }: { params: Promise<{ eventId: string }> }) {
  const { grants, allowed } = await getAdminAccess("schedule");
  if (!allowed) {
    return <AccessDenied />;
  }
  const { eventId } = await params;
  if (!UUID.test(eventId)) {
    notFound();
  }
  const event = await getEventDetail(eventId, grants);
  if (!event) {
    notFound();
  }
  const [source, plan, templates, headings, files] = await Promise.all([
    getSchedulingSource(),
    getServicePlan(eventId),
    listPlanTemplates(),
    getNoteHeadings(),
    getServiceFiles([eventId]),
  ]);
  const open =
    source === "academy" &&
    !event.cancelled &&
    new Date(event.endsAt).getTime() > new Date().getTime();

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <Breadcrumbs
          items={[
            { label: "Schedule", href: "/admin/schedule" },
            { label: event.title, href: `/admin/schedule/${event.id}` },
            { label: "Order of service" },
          ]}
        />
        <h1 className="text-title font-semibold">Order of service</h1>
        <p className="text-text-secondary">
          {event.title} · {eventTimeLabel(event.startsAt, event.endsAt)}
        </p>
      </header>

      {open ? (
        <>
          {templates.length > 0 ? (
            <section
              aria-label="Use a plan template"
              className="flex max-w-3xl flex-col gap-2 rounded-card border border-border p-5"
            >
              <ActionForm
                action={applyTemplateAction}
                submitLabel="Use this plan"
                pendingLabel="Applying…"
                variant="secondary"
                hidden={{ eventId: event.id }}
                className="flex flex-wrap items-end gap-3"
              >
                <Field
                  id="apply-template"
                  label="Plan template"
                  hint="Replaces the order below with the template's. You can change anything after."
                >
                  <select
                    id="apply-template"
                    name="templateId"
                    aria-describedby="apply-template-hint"
                    className={fieldClasses}
                  >
                    {templates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name}
                      </option>
                    ))}
                  </select>
                </Field>
              </ActionForm>
            </section>
          ) : null}

          <section aria-labelledby="items-heading" className="flex max-w-4xl flex-col gap-3">
            <h2 id="items-heading" className="text-heading font-semibold">
              Items
            </h2>
            <PlanEditor
              initialItems={plan.items}
              headings={headings}
              startsAt={event.startsAt}
              action={saveServicePlanAction}
              hidden={{ eventId: event.id }}
              submitLabel="Save order of service"
            />
          </section>

          <section
            aria-labelledby="as-template-heading"
            className="flex max-w-3xl flex-col gap-3 rounded-card border border-border p-5"
          >
            <h2 id="as-template-heading" className="text-heading font-semibold">
              Save as a plan template
            </h2>
            <p className="text-small text-text-secondary">
              Saves the order as it was last saved here, so other services can use it.
            </p>
            <ActionForm
              action={savePlanTemplateAction}
              submitLabel="Save as a template"
              pendingLabel="Saving…"
              variant="secondary"
              hidden={{ templateId: "", items: JSON.stringify(plan.items) }}
              className="flex flex-wrap items-end gap-3"
            >
              <Field id="template-name" label="Template name">
                <input
                  id="template-name"
                  name="name"
                  required
                  maxLength={80}
                  placeholder="Communion Sunday"
                  className={fieldClasses}
                />
              </Field>
            </ActionForm>
          </section>

          <section aria-labelledby="times-heading" className="flex max-w-3xl flex-col gap-3">
            <h2 id="times-heading" className="text-heading font-semibold">
              Other times
            </h2>
            <p className="text-small text-text-secondary">
              The service itself is {eventTimeLabel(event.startsAt, event.endsAt)}. Add rehearsals
              or sound checks on the same day; they show in the request email, reminders, and
              calendars.
            </p>
            <TimesEditor eventId={event.id} startsAt={event.startsAt} initialTimes={plan.times} />
          </section>

          <section aria-labelledby="files-heading" className="flex max-w-3xl flex-col gap-3">
            <h2 id="files-heading" className="text-heading font-semibold">
              Files
            </h2>
            <p className="text-small text-text-secondary">
              Stage plots, run sheets, and the like. Only schedulers and the people asked to serve
              at this service can open them.
            </p>
            {files.length > 0 ? (
              <ul className="flex flex-col divide-y divide-border rounded-card border border-border">
                {files.map((file) => (
                  <li
                    key={file.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                  >
                    <span className="flex flex-col">
                      {file.url ? (
                        <a
                          href={file.url}
                          target="_blank"
                          rel="noreferrer"
                          className="font-medium text-accent-light underline-offset-4 hover:underline"
                        >
                          {file.name}
                        </a>
                      ) : (
                        <span className="font-medium">{file.name}</span>
                      )}
                      <span className="text-small text-text-muted">
                        {SERVICE_FILE_TYPES[file.mimeType] ?? "File"} · {fileSizeLabel(file.bytes)}
                      </span>
                    </span>
                    <ActionForm
                      action={removeServiceFileAction}
                      submitLabel="Remove"
                      pendingLabel="Removing…"
                      variant="tertiary"
                      hidden={{ fileId: file.id }}
                      srLabel={file.name}
                      className="flex"
                    />
                  </li>
                ))}
              </ul>
            ) : null}
            <ActionForm
              action={addServiceFileAction}
              submitLabel="Add file"
              pendingLabel="Uploading…"
              variant="secondary"
              hidden={{ eventId: event.id }}
              className="flex flex-wrap items-end gap-3"
            >
              <Field id="service-file" label="File (up to 10 MB)">
                <input
                  id="service-file"
                  name="file"
                  type="file"
                  required
                  accept={Object.keys(SERVICE_FILE_TYPES).join(",")}
                  className={fieldClasses}
                />
              </Field>
            </ActionForm>
          </section>
        </>
      ) : (
        <ReadOnlyPlan items={plan.items} planningCenter={source !== "academy"} />
      )}
    </div>
  );
}

function ReadOnlyPlan({
  items,
  planningCenter,
}: {
  items: Awaited<ReturnType<typeof getServicePlan>>["items"];
  planningCenter: boolean;
}) {
  const { starts } = planTimeline(items);
  return (
    <section aria-labelledby="items-heading" className="flex max-w-3xl flex-col gap-3">
      <h2 id="items-heading" className="text-heading font-semibold">
        Items
      </h2>
      <p className="text-small text-text-secondary">
        {planningCenter
          ? "Planned in Planning Center. Changes made there show here within 15 minutes."
          : "This service is over or cancelled, so its order of service can't change."}
      </p>
      {items.length === 0 ? (
        <p className="text-small text-text-muted">No items.</p>
      ) : (
        <ol className="flex flex-col divide-y divide-border rounded-card border border-border">
          {items.map((item, index) => (
            <li
              key={item.id ?? index}
              className={`flex flex-col gap-1 px-4 py-2 ${item.kind === "header" ? "bg-card font-semibold" : ""}`}
            >
              <span className="flex flex-wrap items-baseline gap-3">
                {item.kind !== "header" ? (
                  <span className="w-12 text-small text-text-muted tabular-nums">
                    {formatLength(starts[index] ?? 0)}
                  </span>
                ) : null}
                <span className="flex-1">{item.title}</span>
                {item.kind !== "header" ? (
                  <span className="text-small text-text-muted">
                    {PLAN_ITEM_KIND_LABELS[item.kind]} · {formatLength(item.lengthSeconds)}
                  </span>
                ) : null}
              </span>
              {item.notes.map((note, at) => (
                <span key={at} className="text-small text-text-secondary sm:pl-16">
                  <span className="font-medium">{note.category}:</span> {note.content}
                </span>
              ))}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
