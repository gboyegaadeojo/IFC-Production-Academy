import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { getAdminAccess } from "@/lib/data/admin/access";
import { getServiceHeader, getServiceRecord } from "@/lib/data/checklists";
import { formatDateTime } from "@/lib/domain/admin";
import { progressLabel, type RecordTask } from "@/lib/domain/checklists";
import { eventTimeLabel } from "@/lib/domain/schedule";
import { AccessDenied } from "../../../access-denied";
import { PageSkeleton } from "../../../page-skeleton";

export const metadata: Metadata = { title: "Service record" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Props = PageProps<"/admin/checklists/history/[eventId]">;

export default function ServiceRecordPage({ params }: Props) {
  return (
    <Suspense fallback={<PageSkeleton label="Loading the record…" />}>
      <RecordContent params={params} />
    </Suspense>
  );
}

/**
 * One service's record (checklist app US-07b): "X of Y done" overall and per department, the
 * tasks that weren't ticked, those that were, and those removed during the service.
 */
async function RecordContent({ params }: Pick<Props, "params">) {
  const { allowed } = await getAdminAccess("checklists");
  if (!allowed) {
    return <AccessDenied />;
  }
  const { eventId } = await params;
  if (!UUID.test(eventId)) {
    notFound();
  }
  const [service, record] = await Promise.all([
    getServiceHeader(eventId),
    getServiceRecord(eventId),
  ]);
  if (!service) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <Breadcrumbs
          items={[
            { label: "Service history", href: "/admin/checklists/history" },
            { label: service.title },
          ]}
        />
        <h1 className="text-title font-semibold">{service.title}</h1>
        <p className="text-text-secondary">{eventTimeLabel(service.startsAt, service.endsAt)}</p>
        <p className="flex flex-wrap items-center gap-3">
          <StatusBadge
            tone={
              record.total > 0 && record.done === record.total
                ? "success"
                : record.done > 0
                  ? "pending"
                  : "neutral"
            }
          >
            {progressLabel(record.done, record.total)}
          </StatusBadge>
          <Link
            href={`/admin/checklists/activity?service=${service.id}`}
            className="text-small font-medium text-accent-light underline-offset-4 hover:underline"
          >
            Activity at this service
          </Link>
        </p>
      </header>

      {record.departments.length === 0 ? (
        <EmptyState title="Nothing recorded">
          No checklist tasks were recorded for this service.
        </EmptyState>
      ) : (
        record.departments.map((department) => (
          <section
            key={department.id}
            aria-labelledby={`dept-${department.id}`}
            className="flex max-w-3xl flex-col gap-3"
          >
            <h2
              id={`dept-${department.id}`}
              className="flex flex-wrap items-center gap-2 text-heading font-semibold"
            >
              {department.name}
              <span className="text-small font-normal text-text-secondary">
                {progressLabel(department.done, department.total)}
              </span>
            </h2>
            <TaskList title="Not done" tasks={department.notDone} />
            <TaskList title="Done" tasks={department.doneTasks} />
            <TaskList title="Removed during the service" tasks={department.removed} />
          </section>
        ))
      )}
    </div>
  );
}

function TaskList({ title, tasks }: { title: string; tasks: RecordTask[] }) {
  if (tasks.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-col gap-1">
      <h3 className="text-small font-semibold text-text-secondary">
        {title} ({tasks.length})
      </h3>
      <ul className="flex flex-col divide-y divide-border rounded-card border border-border">
        {tasks.map((task) => (
          <li key={task.id} className="flex flex-col gap-0.5 px-4 py-2 text-small">
            <span className="text-text">{task.text}</span>
            <span className="text-text-muted">
              {task.section}
              {task.checkedAt
                ? ` · ${task.checkedByName ?? "Someone"}, ${formatDateTime(task.checkedAt)}`
                : ""}
              {task.removedAt ? ` · removed ${formatDateTime(task.removedAt)}` : ""}
            </span>
            {task.checkedUnder ? (
              <span className="text-text-muted">Ticked as “{task.checkedUnder}”</span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
