import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ActionForm, Field, fieldClasses } from "@/components/ui/action-form";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { getAdminAccess } from "@/lib/data/admin/access";
import { getCurrentServiceList, listChecklists, listTaskLists } from "@/lib/data/checklists";
import { getUnlinkedPlaces } from "@/lib/data/planning-center";
import { getTeamDepartments } from "@/lib/data/teams";
import { hasCapability } from "@/lib/domain/capabilities";
import {
  canSwitchCurrentService,
  hideBlocker,
  MAX_LIST_DESCRIPTION_LENGTH,
  MAX_LIST_NAME_LENGTH,
  type TaskList,
} from "@/lib/domain/checklists";
import { TIME_ZONE } from "@/lib/domain/schedule";
import { AccessDenied } from "../access-denied";
import { PageSkeleton } from "../page-skeleton";
import {
  createChecklistAction,
  createTaskListAction,
  moveAction,
  setDefaultTaskListAction,
  setTaskListHiddenAction,
  updateTaskListAction,
} from "./actions";

export const metadata: Metadata = { title: "Pre-service checklists" };

type Props = PageProps<"/admin/checklists">;

export default function ChecklistsPage({ searchParams }: Props) {
  return (
    <Suspense fallback={<PageSkeleton label="Loading checklists…" />}>
      <ChecklistsContent searchParams={searchParams} />
    </Suspense>
  );
}

/**
 * Pre-service checklists (decision record 9, stage 2), in task lists as in IFC's checklist app
 * (its US-11): a default list for regular services, and others for special ones.
 */
async function ChecklistsContent({ searchParams }: Pick<Props, "searchParams">) {
  const { grants, allowed } = await getAdminAccess("checklists");
  if (!allowed) {
    return <AccessDenied />;
  }
  const { list } = await searchParams;
  const [lists, current, departments] = await Promise.all([
    listTaskLists(),
    getCurrentServiceList(),
    getTeamDepartments(grants, "checklist.manage"),
  ]);
  const visible = lists.filter((l) => !l.hiddenAt);
  const hidden = lists.filter((l) => l.hiddenAt);
  const selected =
    visible.find((l) => l.id === list) ?? visible.find((l) => l.isDefault) ?? visible[0];
  const [items, unlinked] = await Promise.all([
    selected ? listChecklists(grants, selected.id) : Promise.resolve([]),
    current ? getUnlinkedPlaces(current.eventId) : Promise.resolve([]),
  ]);
  // Lists are church-wide, so only church-wide checklist managers change them.
  const managesLists = hasCapability(grants, "checklist.manage");

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Pre-service checklists"
        description="What each position does before and after a service. People see their own checklist first on the day, and can tick as they go."
      />

      <section aria-labelledby="lists-heading" className="flex max-w-3xl flex-col gap-3">
        <h2 id="lists-heading" className="text-heading font-semibold">
          Task lists
        </h2>
        <p className="text-small text-text-secondary">
          New services use the default list, and keep the list they started with. For a special
          service, make its list the default beforehand and switch back afterwards.
        </p>
        <ul
          aria-label="Task lists"
          className="flex flex-col divide-y divide-border rounded-card border border-border"
        >
          {visible.map((taskList) => (
            <li key={taskList.id}>
              <Link
                href={`/admin/checklists?list=${taskList.id}`}
                aria-current={taskList.id === selected?.id ? "page" : undefined}
                scroll={false}
                className={`flex min-h-touch flex-col gap-1 px-4 py-3 hover:bg-card ${
                  taskList.id === selected?.id ? "bg-card" : ""
                }`}
              >
                <span className="flex flex-wrap items-center gap-2 font-medium text-text">
                  {taskList.name}
                  {taskList.isDefault ? <StatusBadge tone="info">Default</StatusBadge> : null}
                  {current?.setId === taskList.id ? (
                    <StatusBadge tone="success">Current service</StatusBadge>
                  ) : null}
                </span>
                <span className="text-small text-text-muted">
                  {taskList.checklists} {taskList.checklists === 1 ? "department" : "departments"} ·{" "}
                  {taskList.items} {taskList.items === 1 ? "task" : "tasks"}
                  {taskList.description ? ` · ${taskList.description}` : ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
        {current ? (
          <p className="text-small text-text-secondary">
            The current service is {current.title}, {DAY.format(new Date(current.startsAt))}. It
            uses {lists.find((l) => l.id === current.setId)?.name ?? "the default list"}.
          </p>
        ) : null}
        {unlinked.length > 0 ? (
          // Checklist app US-15, C39: scheduled, but their position matches no checklist.
          <div
            role="note"
            className="flex flex-col gap-2 rounded-card border border-border-strong p-4 text-small"
          >
            <p className="flex items-center gap-2 font-medium text-text">
              <StatusBadge tone="pending">
                {unlinked.length} {unlinked.length === 1 ? "person" : "people"}
              </StatusBadge>
              won&apos;t see a checklist for the current service
            </p>
            <p className="text-text-secondary">
              Their Planning Center position isn&apos;t linked:{" "}
              {unlinked
                .map((place) => `${place.personName} (${place.positionName || place.teamName})`)
                .join(", ")}
              .
            </p>
            <Link
              href="/admin/planning-center"
              className="w-fit text-accent-light underline-offset-4 hover:underline"
            >
              Link positions on the Planning Center page
            </Link>
          </div>
        ) : null}
      </section>

      {selected ? (
        <section aria-labelledby="list-heading" className="flex max-w-3xl flex-col gap-4">
          <h2 id="list-heading" className="text-heading font-semibold">
            {selected.name}
          </h2>
          {managesLists ? <ManageList list={selected} current={current} lists={visible} /> : null}
          <Link
            href={`/admin/checklists/hidden?list=${selected.id}`}
            className="text-small font-medium text-accent-light underline-offset-4 hover:underline"
          >
            Hidden items in {selected.name}
          </Link>

          {items.length === 0 ? (
            <EmptyState title="No department checklists in this list yet">
              Add one below, then paste in its tasks. One per kind of position works well, such as
              Camera Operators or Audio Engineer.
            </EmptyState>
          ) : (
            <ul
              aria-label={`Checklists in ${selected.name}`}
              className="flex flex-col divide-y divide-border rounded-card border border-border"
            >
              {items.map((checklist, index) => {
                const previous = items[index - 1];
                const next = items[index + 1];
                return (
                  <li key={checklist.id} className="flex flex-wrap items-center gap-2 pr-3">
                    <Link
                      href={`/admin/checklists/${checklist.id}`}
                      className="flex min-h-touch flex-1 flex-col gap-1 px-4 py-3 hover:bg-card"
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
                    {previous ? <SwapOrder a={checklist} b={previous} label="Move up" /> : null}
                    {next ? <SwapOrder a={checklist} b={next} label="Move down" /> : null}
                  </li>
                );
              })}
            </ul>
          )}

          {departments.length > 0 ? (
            <div className="flex flex-col gap-4 rounded-card border border-dashed border-border p-5">
              <h3 className="text-subheading font-semibold">Add a checklist to {selected.name}</h3>
              <ActionForm
                action={createChecklistAction}
                submitLabel="Add checklist"
                pendingLabel="Adding…"
                hidden={{ listId: selected.id }}
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
            </div>
          ) : null}
        </section>
      ) : null}

      {managesLists ? (
        <section
          aria-labelledby="new-list-heading"
          className="flex max-w-2xl flex-col gap-4 rounded-card border border-dashed border-border p-5"
        >
          <h2 id="new-list-heading" className="text-subheading font-semibold">
            New task list
          </h2>
          <ActionForm action={createTaskListAction} submitLabel="Add list" pendingLabel="Adding…">
            <Field id="list-name" label="List name">
              <input
                id="list-name"
                name="name"
                required
                maxLength={MAX_LIST_NAME_LENGTH}
                placeholder="Christmas Eve"
                className={fieldClasses}
              />
            </Field>
            <Field id="list-description" label="Description (optional)">
              <input
                id="list-description"
                name="description"
                maxLength={MAX_LIST_DESCRIPTION_LENGTH}
                className={fieldClasses}
              />
            </Field>
            <Field
              id="list-start"
              label="Start with"
              hint="A copy brings the departments, sections and tasks in order. Hidden items and position links stay behind."
            >
              <select id="list-start" name="copyFrom" className={fieldClasses}>
                <option value="">An empty list</option>
                {visible.map((taskList) => (
                  <option key={taskList.id} value={taskList.id}>
                    A copy of {taskList.name}
                  </option>
                ))}
              </select>
            </Field>
          </ActionForm>
        </section>
      ) : null}

      {managesLists && hidden.length > 0 ? (
        <section aria-labelledby="hidden-lists-heading" className="flex max-w-3xl flex-col gap-3">
          <h2 id="hidden-lists-heading" className="text-subheading font-semibold">
            Hidden lists
          </h2>
          <ul className="flex flex-col divide-y divide-border rounded-card border border-border">
            {hidden.map((taskList) => (
              <li key={taskList.id} className="flex flex-col gap-2 px-4 py-3">
                <span className="font-medium text-text">{taskList.name}</span>
                <ActionForm
                  action={setTaskListHiddenAction}
                  submitLabel="Restore"
                  pendingLabel="Restoring…"
                  variant="secondary"
                  srLabel={taskList.name}
                  hidden={{ listId: taskList.id, hidden: "false" }}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

const DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  weekday: "long",
  month: "long",
  day: "numeric",
});

function ManageList({
  list,
  current,
  lists,
}: {
  list: TaskList;
  current: { title: string; setId: string; hasCheckoffs: boolean } | null;
  lists: TaskList[];
}) {
  const blocker = hideBlocker(list);
  const offerSwitch = canSwitchCurrentService(current, list.id);
  return (
    <div className="flex flex-col gap-4 rounded-card border border-border p-5">
      {list.description ? <p className="text-text-secondary">{list.description}</p> : null}
      {list.isDefault ? (
        <p className="text-small text-text-secondary">
          This is the default list: new services use it.
        </p>
      ) : (
        <ActionForm
          action={setDefaultTaskListAction}
          submitLabel="Make this the default"
          pendingLabel="Saving…"
          variant="secondary"
          hidden={{ listId: list.id }}
        >
          {offerSwitch && current ? (
            <label className="flex min-h-touch items-center gap-3 text-small">
              <input type="checkbox" name="switchCurrent" className="size-5" />
              Also use it for the current service, {current.title}
            </label>
          ) : current && current.setId !== list.id && current.hasCheckoffs ? (
            <p className="text-small text-text-muted">
              Something is already ticked for {current.title}, so it keeps{" "}
              {lists.find((l) => l.id === current.setId)?.name ?? "its list"}.
            </p>
          ) : null}
        </ActionForm>
      )}
      <details>
        <summary className="flex min-h-control cursor-pointer items-center text-small font-medium">
          Rename or describe
        </summary>
        <div className="mt-3">
          <ActionForm
            action={updateTaskListAction}
            submitLabel="Save"
            pendingLabel="Saving…"
            hidden={{ listId: list.id }}
          >
            <Field id={`rename-${list.id}`} label="Rename to">
              <input
                id={`rename-${list.id}`}
                name="name"
                required
                defaultValue={list.name}
                maxLength={MAX_LIST_NAME_LENGTH}
                className={fieldClasses}
              />
            </Field>
            <Field id={`describe-${list.id}`} label="Description (optional)">
              <input
                id={`describe-${list.id}`}
                name="description"
                defaultValue={list.description}
                maxLength={MAX_LIST_DESCRIPTION_LENGTH}
                className={fieldClasses}
              />
            </Field>
          </ActionForm>
        </div>
      </details>
      {blocker ? (
        <p className="text-small text-text-muted">{blocker}</p>
      ) : (
        <ActionForm
          action={setTaskListHiddenAction}
          submitLabel="Hide this list"
          pendingLabel="Hiding…"
          variant="secondary"
          hidden={{ listId: list.id, hidden: "true" }}
        />
      )}
    </div>
  );
}

/** Move up or down: swaps a department checklist's place with its neighbour's. */
function SwapOrder({
  a,
  b,
  label,
}: {
  a: { id: string; name: string; sortOrder: number };
  b: { id: string; sortOrder: number };
  label: string;
}) {
  return (
    <ActionForm
      action={moveAction}
      submitLabel={label}
      pendingLabel="Moving…"
      variant="tertiary"
      srLabel={a.name}
      hidden={{
        table: "checklists",
        aId: a.id,
        aOrder: String(a.sortOrder),
        bId: b.id,
        bOrder: String(b.sortOrder),
      }}
      className="flex"
    />
  );
}
