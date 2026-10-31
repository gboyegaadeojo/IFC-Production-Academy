import type { Metadata } from "next";
import { Suspense } from "react";
import { ActionForm, Field, fieldClasses } from "@/components/ui/action-form";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { getAdminAccess } from "@/lib/data/admin/access";
import { getReadinessAdmin, type DepartmentReadinessAdmin } from "@/lib/data/competency";
import {
  COMPETENCY_STATE_LABELS,
  competencyState,
  EXPIRY_CHOICES,
  expiryLabel,
} from "@/lib/domain/competency";
import { formatDate } from "@/lib/domain/dates";
import { AccessDenied } from "../access-denied";
import { PageSkeleton } from "../page-skeleton";
import {
  archiveCompetencyAction,
  archiveServingRoleAction,
  createCompetencyAction,
  createServingRoleAction,
  reinstateCompetencyAction,
  setRoleCompetenciesAction,
  suspendCompetencyAction,
  updateCompetencyAction,
} from "./actions";

export const metadata: Metadata = { title: "Competencies and roles" };

export default function CompetenciesPage() {
  return (
    <Suspense fallback={<PageSkeleton label="Loading competencies…" />}>
      <CompetenciesContent />
    </Suspense>
  );
}

/**
 * Competencies, serving roles, and who holds what (SRS-COMP-001..004, -008). Leaders define them;
 * passed practicals grant competencies and the system works out Approved to Serve. Leaders can
 * suspend a competency with a reason, which withdraws Approved to Serve where it's needed.
 */
async function CompetenciesContent() {
  const { grants, allowed } = await getAdminAccess("competencies");
  if (!allowed) {
    return <AccessDenied />;
  }
  const departments = await getReadinessAdmin(grants);

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        title="Competencies and roles"
        description="A competency is a skill or piece of equipment someone has shown they can handle. A serving role lists the competencies it needs. Passing a practical grants the competency, and Approved to Serve follows automatically once a role's competencies are all approved."
      />
      {departments.map((department) => (
        <DepartmentSection key={department.id} department={department} />
      ))}
    </div>
  );
}

function ExpirySelect({ id, value }: { id: string; value: number | null }) {
  return (
    <Field id={id} label="Expiry">
      <select
        id={id}
        name="expiryMonths"
        defaultValue={value === null ? "never" : String(value)}
        className={`${fieldClasses} w-56`}
      >
        {EXPIRY_CHOICES.map((months) => (
          <option key={months ?? "never"} value={months === null ? "never" : months}>
            {expiryLabel(months)}
          </option>
        ))}
      </select>
    </Field>
  );
}

function DepartmentSection({ department }: { department: DepartmentReadinessAdmin }) {
  const { competencies, roles } = department.setup;
  const now = new Date();
  const prefix = department.id;
  return (
    <section aria-labelledby={`dept-${prefix}`} className="flex flex-col gap-6">
      <h2 id={`dept-${prefix}`} className="text-heading font-semibold">
        {department.name}
      </h2>

      <div className="flex flex-col gap-3">
        <h3 className="text-subheading font-semibold">Competencies</h3>
        {competencies.length === 0 ? (
          <EmptyState title="No competencies yet">
            Add the skills and equipment people need to show they can handle, for example
            &ldquo;Camera presets&rdquo; or &ldquo;Framing a speaker&rdquo;.
          </EmptyState>
        ) : (
          <ul className="flex max-w-3xl flex-col divide-y divide-border rounded-card border border-border">
            {competencies.map((competency) => (
              <li key={competency.id} className="flex flex-col gap-2 p-4">
                <p className="font-medium">{competency.name}</p>
                <p className="text-small text-text-muted">
                  {[competency.description || null, expiryLabel(competency.expiryMonths)]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {department.canManage ? (
                  <details>
                    <summary className="flex min-h-control cursor-pointer items-center text-small font-medium text-text-secondary hover:text-text">
                      Edit or archive<span className="sr-only"> {competency.name}</span>
                    </summary>
                    <div className="mt-3 flex flex-col gap-4">
                      <ActionForm
                        action={updateCompetencyAction}
                        submitLabel="Save competency"
                        hidden={{ competencyId: competency.id }}
                      >
                        <Field id={`c-name-${competency.id}`} label="Name">
                          <input
                            id={`c-name-${competency.id}`}
                            name="name"
                            required
                            maxLength={80}
                            defaultValue={competency.name}
                            className={fieldClasses}
                          />
                        </Field>
                        <Field id={`c-desc-${competency.id}`} label="Description (optional)">
                          <input
                            id={`c-desc-${competency.id}`}
                            name="description"
                            maxLength={500}
                            defaultValue={competency.description}
                            className={fieldClasses}
                          />
                        </Field>
                        <ExpirySelect
                          id={`c-exp-${competency.id}`}
                          value={competency.expiryMonths}
                        />
                      </ActionForm>
                      <ActionForm
                        action={archiveCompetencyAction}
                        submitLabel="Archive competency"
                        pendingLabel="Archiving…"
                        variant="destructive"
                        hidden={{ competencyId: competency.id }}
                      />
                    </div>
                  </details>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {department.canManage ? (
          <div className="max-w-3xl rounded-card border border-dashed border-border p-5">
            <ActionForm
              action={createCompetencyAction}
              submitLabel="Add competency"
              pendingLabel="Adding…"
              variant="secondary"
              hidden={{ departmentId: department.id }}
              className="flex flex-col gap-3"
            >
              <Field id={`new-c-${prefix}`} label="New competency name">
                <input
                  id={`new-c-${prefix}`}
                  name="name"
                  required
                  maxLength={80}
                  className={fieldClasses}
                />
              </Field>
              <Field id={`new-c-desc-${prefix}`} label="Description (optional)">
                <input
                  id={`new-c-desc-${prefix}`}
                  name="description"
                  maxLength={500}
                  className={fieldClasses}
                />
              </Field>
              <ExpirySelect id={`new-c-exp-${prefix}`} value={null} />
            </ActionForm>
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="text-subheading font-semibold">Serving roles</h3>
        {roles.length === 0 ? (
          <EmptyState title="No serving roles yet">
            Add the roles people serve in, for example &ldquo;Camera 2 operator&rdquo;, then choose
            the competencies each one needs.
          </EmptyState>
        ) : (
          <ul className="flex max-w-3xl flex-col divide-y divide-border rounded-card border border-border">
            {roles.map((role) => (
              <li key={role.id} className="flex flex-col gap-3 p-4">
                <div className="flex flex-col gap-1">
                  <p className="font-medium">{role.name}</p>
                  {role.description ? (
                    <p className="text-small text-text-secondary">{role.description}</p>
                  ) : null}
                  <p className="text-small text-text-muted">
                    {role.required.length === 0
                      ? "Needs no competencies yet, so nobody can be approved for it."
                      : `Needs ${role.required.map((c) => c.name).join(", ")}`}
                  </p>
                </div>
                {department.canManage ? (
                  <details>
                    <summary className="flex min-h-control cursor-pointer items-center text-small font-medium text-text-secondary hover:text-text">
                      Change what it needs<span className="sr-only"> for {role.name}</span>
                    </summary>
                    <div className="mt-3 flex flex-col gap-4">
                      {competencies.length === 0 ? (
                        <p className="text-small text-text-muted">Add competencies first.</p>
                      ) : (
                        <ActionForm
                          action={setRoleCompetenciesAction}
                          submitLabel="Save requirements"
                          hidden={{ roleId: role.id }}
                        >
                          <fieldset className="flex flex-col gap-1">
                            <legend className="mb-1 text-small font-medium text-text-secondary">
                              Competencies {role.name} needs
                            </legend>
                            {competencies.map((competency) => (
                              <label
                                key={competency.id}
                                className="flex min-h-control items-center gap-3"
                              >
                                <input
                                  type="checkbox"
                                  name="competencyId"
                                  value={competency.id}
                                  defaultChecked={role.required.some((c) => c.id === competency.id)}
                                  className="size-5 accent-accent"
                                />
                                {competency.name}
                              </label>
                            ))}
                          </fieldset>
                        </ActionForm>
                      )}
                      <ActionForm
                        action={archiveServingRoleAction}
                        submitLabel="Archive role"
                        pendingLabel="Archiving…"
                        variant="destructive"
                        hidden={{ roleId: role.id }}
                      />
                    </div>
                  </details>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {department.canManage ? (
          <div className="max-w-3xl rounded-card border border-dashed border-border p-5">
            <ActionForm
              action={createServingRoleAction}
              submitLabel="Add role"
              pendingLabel="Adding…"
              variant="secondary"
              hidden={{ departmentId: department.id }}
              className="flex flex-col gap-3"
            >
              <Field id={`new-r-${prefix}`} label="New role name">
                <input
                  id={`new-r-${prefix}`}
                  name="name"
                  required
                  maxLength={80}
                  className={fieldClasses}
                />
              </Field>
              <Field id={`new-r-desc-${prefix}`} label="Description (optional)">
                <input
                  id={`new-r-desc-${prefix}`}
                  name="description"
                  maxLength={500}
                  className={fieldClasses}
                />
              </Field>
            </ActionForm>
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="text-subheading font-semibold">People</h3>
        {department.people.length === 0 ? (
          <EmptyState title="Nobody holds a competency yet">
            Competencies appear here when someone passes a practical assessment.
          </EmptyState>
        ) : (
          <ul className="flex max-w-3xl flex-col divide-y divide-border rounded-card border border-border">
            {department.people.map(({ person, records, approvedRoleIds }) => (
              <li key={person.id} className="flex flex-col gap-3 p-4">
                <div className="flex flex-col gap-1">
                  <p className="font-medium">{person.displayName}</p>
                  <p className="text-small text-text-muted">
                    {approvedRoleIds.size === 0
                      ? "Not approved to serve in any role yet"
                      : `Approved to serve: ${roles
                          .filter((r) => approvedRoleIds.has(r.id))
                          .map((r) => r.name)
                          .join(", ")}`}
                  </p>
                </div>
                <ul className="flex flex-col gap-3">
                  {competencies.flatMap((competency) => {
                    const record = records.get(competency.id);
                    if (!record) {
                      return [];
                    }
                    const state = competencyState(record, now);
                    return [
                      <li key={competency.id} className="flex flex-col gap-2">
                        <div className="flex flex-wrap items-center gap-2 text-small">
                          <span>{competency.name}</span>
                          <StatusBadge tone={state === "approved" ? "success" : "pending"}>
                            {COMPETENCY_STATE_LABELS[state]}
                          </StatusBadge>
                          <span className="text-text-muted">
                            Granted {formatDate(record.grantedAt)}
                            {record.expiresAt ? ` · expires ${formatDate(record.expiresAt)}` : ""}
                          </span>
                        </div>
                        {record.suspendReason ? (
                          <p className="text-small text-text-secondary">
                            Suspended: {record.suspendReason}
                          </p>
                        ) : null}
                        {department.canManage ? (
                          record.status === "suspended" ? (
                            <ActionForm
                              action={reinstateCompetencyAction}
                              submitLabel="Reinstate"
                              pendingLabel="Saving…"
                              variant="secondary"
                              hidden={{ recordId: record.id }}
                              srLabel={`${competency.name} for ${person.displayName}`}
                            />
                          ) : (
                            <details>
                              <summary className="flex min-h-control cursor-pointer items-center text-small font-medium text-text-secondary hover:text-text">
                                Suspend
                                <span className="sr-only">
                                  {" "}
                                  {competency.name} for {person.displayName}
                                </span>
                              </summary>
                              <div className="mt-2">
                                <ActionForm
                                  action={suspendCompetencyAction}
                                  submitLabel="Suspend competency"
                                  pendingLabel="Saving…"
                                  variant="destructive"
                                  hidden={{ recordId: record.id }}
                                >
                                  <Field id={`reason-${record.id}`} label="Reason">
                                    <input
                                      id={`reason-${record.id}`}
                                      name="reason"
                                      required
                                      maxLength={300}
                                      className={fieldClasses}
                                    />
                                  </Field>
                                </ActionForm>
                              </div>
                            </details>
                          )
                        ) : null}
                      </li>,
                    ];
                  })}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
