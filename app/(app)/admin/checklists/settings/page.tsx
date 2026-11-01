import type { Metadata } from "next";
import { Suspense } from "react";
import { ActionForm, Field, fieldClasses } from "@/components/ui/action-form";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { getAdminAccess } from "@/lib/data/admin/access";
import { getChecklistSettings } from "@/lib/data/checklists";
import { WEEKDAYS } from "@/lib/domain/checklists";
import { AccessDenied } from "../../access-denied";
import { PageSkeleton } from "../../page-skeleton";
import { setChecklistSettingsAction } from "../actions";

export const metadata: Metadata = { title: "Checklist settings" };

export default function ChecklistSettingsPage() {
  return (
    <Suspense fallback={<PageSkeleton label="Loading settings…" />}>
      <ChecklistSettingsContent />
    </Suspense>
  );
}

/**
 * Which Planning Center service type the checklist follows, and the service day it opens for
 * when nothing is published (checklist app US-07, US-11a, US-15). Church-wide checklist
 * managers only; the database checks and logs every change.
 */
async function ChecklistSettingsContent() {
  const { allowed } = await getAdminAccess("checklists");
  const settings = allowed ? await getChecklistSettings() : null;
  if (!settings) {
    return <AccessDenied />;
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <Breadcrumbs
          items={[
            { label: "Pre-service checklists", href: "/admin/checklists" },
            { label: "Settings" },
          ]}
        />
        <h1 className="text-title font-semibold">Checklist settings</h1>
        <p className="max-w-2xl text-text-secondary">
          The checklist opens to the next service of this type. Times are in Winnipeg time.
        </p>
      </header>

      <div className="max-w-xl">
        <ActionForm action={setChecklistSettingsAction} submitLabel="Save settings">
          <Field
            id="settings-service-type"
            label="Service type"
            hint={
              settings.serviceTypes.length === 0
                ? "Service types appear here after Planning Center's first sync."
                : "From Planning Center. Other services still have checklists, but don't open first."
            }
          >
            <select
              id="settings-service-type"
              name="serviceTypeId"
              defaultValue={settings.serviceTypeId ?? ""}
              className={fieldClasses}
            >
              <option value="">Any service</option>
              {settings.serviceTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </select>
          </Field>
          <Field
            id="settings-service-day"
            label="Service day"
            hint="When nothing is published yet, the checklist still opens for this day so the team can tick. When Planning Center publishes the service, everything ticked stays with it."
          >
            <select
              id="settings-service-day"
              name="serviceWeekday"
              defaultValue={String(settings.serviceWeekday)}
              className={fieldClasses}
            >
              {WEEKDAYS.map((day, index) => (
                <option key={day} value={index}>
                  {day}
                </option>
              ))}
            </select>
          </Field>
        </ActionForm>
      </div>
    </div>
  );
}
