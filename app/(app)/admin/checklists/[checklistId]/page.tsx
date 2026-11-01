import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ActionForm, Field, fieldClasses } from "@/components/ui/action-form";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { getAdminAccess } from "@/lib/data/admin/access";
import { getChecklist, getDepartmentPositions, type ChecklistDetail } from "@/lib/data/checklists";
import { hasCapability } from "@/lib/domain/capabilities";
import { AccessDenied } from "../../access-denied";
import { PageSkeleton } from "../../page-skeleton";
import {
  addSectionAction,
  archiveChecklistAction,
  importAction,
  itemAction,
  moveAction,
  renameChecklistAction,
  sectionAction,
  setPositionsAction,
} from "../actions";

export const metadata: Metadata = { title: "Checklist" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Props = PageProps<"/admin/checklists/[checklistId]">;

export default function ChecklistPage({ params }: Props) {
  return (
    <Suspense fallback={<PageSkeleton label="Loading the checklist…" />}>
      <ChecklistContent params={params} />
    </Suspense>
  );
}

/**
 * Edit one checklist: who it's for, its sections and items, and pasting in a list. Items are
 * archived, never deleted, and past services keep what was ticked.
 */
async function ChecklistContent({ params }: Pick<Props, "params">) {
  const { grants, allowed } = await getAdminAccess("checklists");
  if (!allowed) {
    return <AccessDenied />;
  }
  const { checklistId } = await params;
  if (!UUID.test(checklistId)) {
    notFound();
  }
  const checklist = await getChecklist(checklistId);
  if (!checklist) {
    notFound();
  }
  if (!hasCapability(grants, "checklist.manage", checklist.departmentId)) {
    return <AccessDenied />;
  }
  const positions = await getDepartmentPositions(checklist.departmentId);

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <Breadcrumbs
          items={[
            { label: "Pre-service checklists", href: "/admin/checklists" },
            { label: checklist.name },
          ]}
        />
        <h1 className="text-title font-semibold">{checklist.name}</h1>
        <p className="text-text-secondary">{checklist.departmentName}</p>
      </header>

      <section
        aria-labelledby="for-heading"
        className="flex max-w-2xl flex-col gap-3 rounded-card border border-border p-5"
      >
        <h2 id="for-heading" className="text-heading font-semibold">
          Who it&apos;s for
        </h2>
        {positions.length === 0 ? (
          <p className="text-small text-text-muted">
            {checklist.departmentName} has no positions yet. Add them in Competencies and roles.
          </p>
        ) : (
          <ActionForm
            action={setPositionsAction}
            submitLabel="Save"
            pendingLabel="Saving…"
            variant="secondary"
            hidden={{ checklistId: checklist.id }}
          >
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-small text-text-secondary">
                People scheduled in these positions see this checklist first. Everyone serving can
                see it.
              </legend>
              {positions.map((position) => (
                <label key={position.id} className="flex min-h-control items-center gap-3">
                  <input
                    type="checkbox"
                    name="roleId"
                    value={position.id}
                    defaultChecked={checklist.positionIds.includes(position.id)}
                    className="size-5 accent-[var(--accent)]"
                  />
                  {position.name}
                </label>
              ))}
            </fieldset>
          </ActionForm>
        )}
      </section>

      <Sections checklist={checklist} />

      <section
        aria-labelledby="paste-heading"
        className="flex max-w-2xl flex-col gap-3 rounded-card border border-dashed border-border p-5"
      >
        <h2 id="paste-heading" className="text-subheading font-semibold">
          Paste a list
        </h2>
        <p className="text-small text-text-secondary">
          One item on each line. Start a line with # to begin a section. Bullets and numbers are
          tidied away. Everything is added after what&apos;s already here.
        </p>
        <ActionForm
          action={importAction}
          submitLabel="Add these"
          pendingLabel="Adding…"
          variant="secondary"
          hidden={{ checklistId: checklist.id }}
        >
          <Field id="paste-text" label="List">
            <textarea
              id="paste-text"
              name="text"
              rows={8}
              required
              placeholder={"# Before the service\nPower on the cameras\nCheck the batteries"}
              className={`${fieldClasses} py-3 font-mono text-small`}
            />
          </Field>
        </ActionForm>
      </section>

      <section
        aria-labelledby="settings-heading"
        className="flex max-w-2xl flex-col gap-4 rounded-card border border-border p-5"
      >
        <h2 id="settings-heading" className="text-subheading font-semibold">
          Name
        </h2>
        <ActionForm
          action={renameChecklistAction}
          submitLabel="Rename"
          pendingLabel="Saving…"
          variant="secondary"
          hidden={{ checklistId: checklist.id }}
        >
          <Field id="checklist-rename" label="Checklist name">
            <input
              id="checklist-rename"
              name="name"
              required
              maxLength={80}
              defaultValue={checklist.name}
              className={fieldClasses}
            />
          </Field>
        </ActionForm>
        <details>
          <summary className="flex min-h-control cursor-pointer items-center font-medium">
            Archive this checklist
          </summary>
          <p className="mt-2 text-text-secondary">
            It stops showing on service days. Past services keep what was ticked.
          </p>
          <div className="mt-3">
            <ActionForm
              action={archiveChecklistAction}
              submitLabel="Archive"
              pendingLabel="Archiving…"
              variant="destructive"
              hidden={{ checklistId: checklist.id }}
            />
          </div>
        </details>
      </section>
    </div>
  );
}

function Sections({ checklist }: { checklist: ChecklistDetail }) {
  return (
    <section aria-labelledby="items-heading" className="flex max-w-3xl flex-col gap-4">
      <h2 id="items-heading" className="text-heading font-semibold">
        Sections and items
      </h2>
      {checklist.sections.length === 0 ? (
        <p className="text-small text-text-muted">
          Nothing yet. Add a section, or paste a list below.
        </p>
      ) : null}
      {checklist.sections.map((section, sectionIndex) => {
        const previous = checklist.sections[sectionIndex - 1];
        const next = checklist.sections[sectionIndex + 1];
        return (
          <div key={section.id} className="flex flex-col rounded-card border border-border">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
              <h3 className="font-semibold">{section.name}</h3>
              <span className="flex flex-wrap gap-1">
                {previous ? (
                  <Move
                    table="checklist_sections"
                    a={section}
                    b={previous}
                    label="Move up"
                    name={section.name}
                  />
                ) : null}
                {next ? (
                  <Move
                    table="checklist_sections"
                    a={section}
                    b={next}
                    label="Move down"
                    name={section.name}
                  />
                ) : null}
              </span>
            </div>
            <ol className="flex flex-col divide-y divide-border">
              {section.items.map((item, itemIndex) => {
                const before = section.items[itemIndex - 1];
                const after = section.items[itemIndex + 1];
                return (
                  <li key={item.id} className="flex flex-col gap-2 px-4 py-2">
                    <span>{item.text}</span>
                    <span className="flex flex-wrap gap-1">
                      {before ? (
                        <Move
                          table="checklist_items"
                          a={item}
                          b={before}
                          label="Move up"
                          name={item.text}
                        />
                      ) : null}
                      {after ? (
                        <Move
                          table="checklist_items"
                          a={item}
                          b={after}
                          label="Move down"
                          name={item.text}
                        />
                      ) : null}
                      <details className="w-full">
                        <summary className="flex min-h-control cursor-pointer items-center text-small text-accent-light">
                          Edit<span className="sr-only"> {item.text}</span>
                        </summary>
                        <div className="mt-2 flex flex-col gap-3">
                          <ActionForm
                            action={itemAction}
                            submitLabel="Save"
                            pendingLabel="Saving…"
                            variant="secondary"
                            hidden={{ itemId: item.id, op: "edit" }}
                          >
                            <Field id={`item-${item.id}`} label="Item">
                              <input
                                id={`item-${item.id}`}
                                name="text"
                                required
                                maxLength={300}
                                defaultValue={item.text}
                                className={fieldClasses}
                              />
                            </Field>
                          </ActionForm>
                          <ActionForm
                            action={itemAction}
                            submitLabel="Remove item"
                            pendingLabel="Removing…"
                            variant="tertiary"
                            hidden={{ itemId: item.id, op: "remove" }}
                            className="flex"
                          />
                        </div>
                      </details>
                    </span>
                  </li>
                );
              })}
            </ol>
            <div className="flex flex-col gap-3 border-t border-border px-4 py-3">
              <ActionForm
                action={sectionAction}
                submitLabel="Add item"
                pendingLabel="Adding…"
                variant="secondary"
                hidden={{ sectionId: section.id, op: "add-item" }}
                className="flex flex-col gap-2"
              >
                <Field id={`new-item-${section.id}`} label={`New item in ${section.name}`}>
                  <input
                    id={`new-item-${section.id}`}
                    name="text"
                    required
                    maxLength={300}
                    className={fieldClasses}
                  />
                </Field>
              </ActionForm>
              <details>
                <summary className="flex min-h-control cursor-pointer items-center text-small text-accent-light">
                  Rename or remove this section
                </summary>
                <div className="mt-2 flex flex-col gap-3">
                  <ActionForm
                    action={sectionAction}
                    submitLabel="Rename"
                    pendingLabel="Saving…"
                    variant="secondary"
                    hidden={{ sectionId: section.id, op: "rename" }}
                  >
                    <Field id={`section-${section.id}`} label="Section name">
                      <input
                        id={`section-${section.id}`}
                        name="name"
                        required
                        maxLength={120}
                        defaultValue={section.name}
                        className={fieldClasses}
                      />
                    </Field>
                  </ActionForm>
                  <ActionForm
                    action={sectionAction}
                    submitLabel="Remove section"
                    pendingLabel="Removing…"
                    variant="tertiary"
                    hidden={{ sectionId: section.id, op: "remove" }}
                    className="flex"
                  />
                </div>
              </details>
            </div>
          </div>
        );
      })}
      <div className="rounded-card border border-dashed border-border p-5">
        <ActionForm
          action={addSectionAction}
          submitLabel="Add section"
          pendingLabel="Adding…"
          variant="secondary"
          hidden={{ checklistId: checklist.id }}
        >
          <Field id="new-section" label="New section">
            <input
              id="new-section"
              name="name"
              required
              maxLength={120}
              placeholder="Before the service"
              className={fieldClasses}
            />
          </Field>
        </ActionForm>
      </div>
    </section>
  );
}

function Move({
  table,
  a,
  b,
  label,
  name,
}: {
  table: "checklist_sections" | "checklist_items";
  a: { id: string; sortOrder: number };
  b: { id: string; sortOrder: number };
  label: string;
  name: string;
}) {
  return (
    <ActionForm
      action={moveAction}
      submitLabel={label}
      pendingLabel="Moving…"
      variant="tertiary"
      hidden={{
        table,
        aId: a.id,
        aOrder: String(a.sortOrder),
        bId: b.id,
        bOrder: String(b.sortOrder),
      }}
      srLabel={name}
      className="flex"
    />
  );
}
