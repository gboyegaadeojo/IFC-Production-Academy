import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ActionForm, Field, fieldClasses } from "@/components/ui/action-form";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { getAdminAccess } from "@/lib/data/admin/access";
import { getSchedulableRoles, getServiceType } from "@/lib/data/service-types";
import { addDays, winnipegDate } from "@/lib/domain/month-calendar";
import { serviceTimeLabel } from "@/lib/domain/service-types";
import { AccessDenied } from "../../../access-denied";
import { PageSkeleton } from "../../../page-skeleton";
import {
  archiveServiceTypeAction,
  changePositionsAction,
  createServicesAction,
  setTypeSignupsAction,
  updateServiceTypeAction,
} from "../actions";
import { ServiceTypeFields } from "../service-type-fields";

export const metadata: Metadata = { title: "Service type" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Props = PageProps<"/admin/schedule/types/[typeId]">;

export default function ServiceTypePage({ params }: Props) {
  return (
    <Suspense fallback={<PageSkeleton label="Loading the service type…" />}>
      <ServiceTypeContent params={params} />
    </Suspense>
  );
}

/** One service type: its details, the positions it needs, and making its dates. */
async function ServiceTypeContent({ params }: Pick<Props, "params">) {
  const { grants, allowed } = await getAdminAccess("schedule");
  if (!allowed) {
    return <AccessDenied />;
  }
  const { typeId } = await params;
  if (!UUID.test(typeId)) {
    notFound();
  }
  const [type, roles] = await Promise.all([getServiceType(typeId), getSchedulableRoles(grants)]);
  if (!type) {
    notFound();
  }
  const today = winnipegDate(new Date());
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  const nextSunday = addDays(today, 7 - weekday);

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <Breadcrumbs
          items={[{ label: "Service types", href: "/admin/schedule/types" }, { label: type.name }]}
        />
        <h1 className="text-title font-semibold">{type.name}</h1>
        <p className="text-text-secondary">
          {serviceTimeLabel(type.startTime, type.durationMinutes)}
          {type.location ? ` · ${type.location}` : ""}
        </p>
      </header>

      <section
        aria-labelledby="make-heading"
        className="flex max-w-2xl flex-col gap-4 rounded-card border border-border p-5"
      >
        <h2 id="make-heading" className="text-heading font-semibold">
          Make services
        </h2>
        <p className="text-small text-text-secondary">
          Each one gets the positions below. Dates that already have this service are skipped.
        </p>
        <div className="flex flex-wrap items-center gap-3 text-small text-text-secondary">
          <span>
            {type.allowSignups
              ? "New services open sign-ups: team members can take open spots."
              : "New services keep sign-ups closed: only schedulers fill positions."}
          </span>
          <ActionForm
            action={setTypeSignupsAction}
            submitLabel={type.allowSignups ? "Keep sign-ups closed" : "Open sign-ups"}
            pendingLabel="Saving…"
            variant="tertiary"
            hidden={{ typeId: type.id, open: type.allowSignups ? "false" : "true" }}
            className="flex"
          />
        </div>
        <ActionForm
          action={createServicesAction}
          submitLabel="Make services"
          pendingLabel="Making…"
          hidden={{ typeId: type.id }}
          className="flex flex-col gap-3"
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <Field id="make-first" label="First date">
              <input
                id="make-first"
                name="firstDate"
                type="date"
                required
                defaultValue={nextSunday}
                className={fieldClasses}
              />
            </Field>
            <Field id="make-count" label="How many">
              <input
                id="make-count"
                name="count"
                type="number"
                min={1}
                max={52}
                required
                defaultValue={8}
                className={fieldClasses}
              />
            </Field>
            <Field id="make-every" label="Repeat">
              <select id="make-every" name="everyWeeks" className={fieldClasses}>
                <option value="1">Every week</option>
                <option value="2">Every 2 weeks</option>
                <option value="3">Every 3 weeks</option>
                <option value="4">Every 4 weeks</option>
              </select>
            </Field>
          </div>
        </ActionForm>
      </section>

      <section aria-labelledby="positions-heading" className="flex max-w-2xl flex-col gap-3">
        <h2 id="positions-heading" className="text-heading font-semibold">
          Positions
        </h2>
        <p className="text-small text-text-secondary">
          One line for each person needed. Changes apply to services made from now on.
        </p>
        {type.positions.length === 0 ? (
          <p className="text-small text-text-muted">No positions yet.</p>
        ) : (
          <ol className="flex flex-col divide-y divide-border rounded-card border border-border">
            {type.positions.map((position, index) => (
              <li
                key={`${position.roleId}-${index}`}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-2"
              >
                <span className="flex flex-col">
                  <span className="font-medium">{position.roleName}</span>
                  <span className="text-small text-text-muted">{position.departmentName}</span>
                </span>
                <span className="flex flex-wrap gap-1">
                  {index > 0 ? (
                    <ActionForm
                      action={changePositionsAction}
                      submitLabel="Move up"
                      pendingLabel="Moving…"
                      variant="tertiary"
                      hidden={{ typeId: type.id, op: "up", index: String(index) }}
                      srLabel={position.roleName}
                      className="flex"
                    />
                  ) : null}
                  {index < type.positions.length - 1 ? (
                    <ActionForm
                      action={changePositionsAction}
                      submitLabel="Move down"
                      pendingLabel="Moving…"
                      variant="tertiary"
                      hidden={{ typeId: type.id, op: "down", index: String(index) }}
                      srLabel={position.roleName}
                      className="flex"
                    />
                  ) : null}
                  <ActionForm
                    action={changePositionsAction}
                    submitLabel="Remove"
                    pendingLabel="Removing…"
                    variant="tertiary"
                    hidden={{ typeId: type.id, op: "remove", index: String(index) }}
                    srLabel={position.roleName}
                    className="flex"
                  />
                </span>
              </li>
            ))}
          </ol>
        )}
        {roles.length > 0 ? (
          <div className="rounded-card border border-dashed border-border p-5">
            <ActionForm
              action={changePositionsAction}
              submitLabel="Add position"
              pendingLabel="Adding…"
              variant="secondary"
              hidden={{ typeId: type.id, op: "add" }}
              className="flex flex-col gap-3"
            >
              <Field id="type-add-position" label="Position">
                <select id="type-add-position" name="roleId" className={fieldClasses}>
                  {roles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.name} ({role.departmentName})
                    </option>
                  ))}
                </select>
              </Field>
            </ActionForm>
          </div>
        ) : (
          <p className="text-small text-text-muted">
            Set up positions in Competencies and roles first.
          </p>
        )}
      </section>

      <section
        aria-labelledby="details-heading"
        className="flex max-w-2xl flex-col gap-4 rounded-card border border-border p-5"
      >
        <h2 id="details-heading" className="text-heading font-semibold">
          Details
        </h2>
        <ActionForm
          action={updateServiceTypeAction}
          submitLabel="Save"
          pendingLabel="Saving…"
          variant="secondary"
          hidden={{ typeId: type.id }}
        >
          <ServiceTypeFields values={type} />
        </ActionForm>
      </section>

      <details className="max-w-2xl rounded-card border border-border p-5">
        <summary className="flex min-h-control cursor-pointer items-center font-medium">
          Archive this service type
        </summary>
        <p className="mt-2 text-text-secondary">
          It stops appearing here. Services already made stay on the schedule.
        </p>
        <div className="mt-3">
          <ActionForm
            action={archiveServiceTypeAction}
            submitLabel="Archive"
            pendingLabel="Archiving…"
            variant="destructive"
            hidden={{ typeId: type.id }}
          />
        </div>
      </details>
    </div>
  );
}
