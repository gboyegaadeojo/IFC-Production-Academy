import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ActionForm, fieldClasses } from "@/components/ui/action-form";
import { StatusBadge } from "@/components/ui/status-badge";
import { PageHeader } from "@/components/ui/page-header";
import { getAdminAccess } from "@/lib/data/admin/access";
import { getCurrentUser } from "@/lib/data/auth";
import { getFollowUps, type FollowUp } from "@/lib/data/onboarding";
import { dueLabel, isOverdue } from "@/lib/domain/onboarding";
import { AccessDenied } from "../../access-denied";
import { PageSkeleton } from "../../page-skeleton";
import { assignTaskAction, claimTaskAction, completeTaskAction } from "../running-actions";

export const metadata: Metadata = { title: "Follow-ups" };

export default function FollowUpsPage() {
  return (
    <Suspense fallback={<PageSkeleton label="Loading follow-ups…" />}>
      <FollowUpsContent />
    </Suspense>
  );
}

/**
 * Follow-ups that pathways create (approved mock, 2026-11-01). Yours first, then ones anyone may
 * take, then the rest of the pathways you look after. A pathway waits until its follow-up is done.
 */
async function FollowUpsContent() {
  const { allowed } = await getAdminAccess("onboarding-follow-ups");
  if (!allowed) {
    return <AccessDenied />;
  }
  const [tasks, me] = await Promise.all([getFollowUps(), getCurrentUser()]);
  const now = new Date();
  const mine = tasks.filter((t) => t.assigneeId === me?.id);
  const open = tasks.filter((t) => t.assigneeId === null);
  const others = tasks.filter((t) => t.assigneeId !== null && t.assigneeId !== me?.id);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="People & Teams"
        title="Follow-ups"
        description="What onboarding needs from you. Ticking one moves that person on to their next step."
      />
      <Group
        title="Yours"
        empty="Nothing waiting on you."
        tasks={mine}
        now={now}
        meId={me?.id ?? null}
      />
      <Group
        title="Anyone can take"
        empty="None waiting to be taken."
        tasks={open}
        now={now}
        meId={me?.id ?? null}
      />
      <Group
        title="With other leaders"
        empty="None."
        tasks={others}
        now={now}
        meId={me?.id ?? null}
      />
      <p className="text-small text-text-muted">
        See everyone&apos;s progress in{" "}
        <Link
          href="/admin/onboarding/people"
          className="text-accent-light underline-offset-4 hover:underline"
        >
          People in pathways
        </Link>
        .
      </p>
    </div>
  );
}

function Group({
  title,
  empty,
  tasks,
  now,
  meId,
}: {
  title: string;
  empty: string;
  tasks: FollowUp[];
  now: Date;
  meId: string | null;
}) {
  const id = `group-${title.toLowerCase().replace(/\W+/g, "-")}`;
  return (
    <section
      aria-labelledby={id}
      className="overflow-hidden rounded-card border border-border bg-surface"
    >
      <h2 id={id} className="border-b border-border px-4 py-3 font-semibold">
        {title} <span className="tabular font-normal text-text-muted">{tasks.length}</span>
      </h2>
      {tasks.length === 0 ? (
        <p className="px-4 py-5 text-small text-text-secondary">{empty}</p>
      ) : (
        <ul className="divide-y divide-border">
          {tasks.map((task) => (
            <Task key={task.id} task={task} now={now} meId={meId} />
          ))}
        </ul>
      )}
    </section>
  );
}

function Task({ task, now, meId }: { task: FollowUp; now: Date; meId: string | null }) {
  const overdue = isOverdue(task.dueAt, now);
  const fromSync = task.kind === "pco_team";
  return (
    <li className="flex flex-col gap-3 px-4 py-3.5 lg:flex-row lg:items-start lg:justify-between">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="font-semibold">
          {task.title} · {task.personName}
        </span>
        <span className="text-small text-text-secondary">
          {task.pathwayName}
          {task.detail ? ` · ${task.detail}` : ""}
        </span>
        <span className="flex flex-wrap items-center gap-2">
          {fromSync ? (
            <StatusBadge tone="info">
              Completes itself when the Planning Center sync sees them
            </StatusBadge>
          ) : overdue ? (
            <StatusBadge tone="pending">{dueLabel(task.dueAt, now)}</StatusBadge>
          ) : (
            <span className="text-small text-text-muted">{dueLabel(task.dueAt, now)}</span>
          )}
          <span className="text-small text-text-muted">
            {task.assigneeName
              ? `With ${task.assigneeId === meId ? "you" : task.assigneeName}`
              : "Not taken yet"}
          </span>
        </span>
      </div>
      <div className="flex flex-wrap items-start gap-2">
        {task.assigneeId === null ? (
          <ActionForm
            action={claimTaskAction}
            submitLabel="I'll take this"
            variant="secondary"
            hidden={{ taskId: task.id }}
            srLabel={`${task.title} for ${task.personName}`}
            className="flex flex-col gap-2"
          />
        ) : null}
        {!fromSync && task.assigneeId !== null ? (
          <ActionForm
            action={completeTaskAction}
            submitLabel="Mark done"
            hidden={{ taskId: task.id }}
            srLabel={`${task.title} for ${task.personName}`}
            className="flex flex-col gap-2"
          />
        ) : null}
        {task.pool.length > 1 ? (
          <details className="text-small">
            <summary className="flex min-h-control cursor-pointer items-center rounded-button px-2 font-medium text-accent-light hover:bg-hover">
              Hand over
              <span className="sr-only">
                {" "}
                {task.title} for {task.personName}
              </span>
            </summary>
            <ActionForm
              action={assignTaskAction}
              submitLabel="Hand over"
              variant="secondary"
              hidden={{ taskId: task.id }}
              className="mt-2 flex flex-col gap-2"
            >
              <label htmlFor={`hand-${task.id}`} className="text-text-secondary">
                Give it to
              </label>
              <select
                id={`hand-${task.id}`}
                name="userId"
                defaultValue={task.assigneeId ?? ""}
                className={fieldClasses}
              >
                {task.pool.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </ActionForm>
          </details>
        ) : null}
      </div>
    </li>
  );
}
