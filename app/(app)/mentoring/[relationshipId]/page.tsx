import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ActionForm, Field, fieldClasses } from "@/components/ui/action-form";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { LockIcon } from "@/components/ui/icons";
import { LoadingStatus, Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireActiveUser } from "@/lib/data/auth";
import { getMyCapabilities } from "@/lib/data/capabilities";
import { getMyPairings, getPairingDetail } from "@/lib/data/mentoring";
import { hasCapability } from "@/lib/domain/capabilities";
import { formatDateTime } from "@/lib/domain/admin";
import { formatDate } from "@/lib/domain/dates";
import { goalOverdue } from "@/lib/domain/mentoring";
import { utcToWinnipeg } from "@/lib/domain/schedule";
import { addGoalAction, addNoteAction, setGoalStatusAction } from "../actions";

export const metadata: Metadata = { title: "Mentoring" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Props = PageProps<"/mentoring/[relationshipId]">;

export default function PairingPage({ params }: Props) {
  return (
    <Suspense fallback={<PairingSkeleton />}>
      <PairingContent params={params} />
    </Suspense>
  );
}

/**
 * One mentoring pairing (SRS-MENTOR-002..004): shared goals and notes, and the mentor's private
 * notes, which only they can read (SRS-RBAC-006).
 */
async function PairingContent({ params }: Pick<Props, "params">) {
  const user = await requireActiveUser();
  const { relationshipId } = await params;
  if (!UUID.test(relationshipId)) {
    notFound();
  }
  const pairing = (await getMyPairings()).find((p) => p.id === relationshipId);
  if (!pairing) {
    notFound();
  }
  const [{ goals, notes }, grants] = await Promise.all([
    getPairingDetail(pairing.id),
    getMyCapabilities(),
  ]);
  const active = pairing.endedAt === null;
  const isMentor = pairing.myPart === "mentor";
  const canPrivate =
    isMentor && hasCapability(grants, "mentoring.private_notes", pairing.departmentId);
  const today = utcToWinnipeg(new Date().toISOString())[0];
  const nameOf = (id: string) =>
    id === user.id ? "You" : id === pairing.mentor.id ? pairing.mentor.name : pairing.mentee.name;
  const shared = notes.filter((n) => n.visibility === "shared");
  const mine = notes.filter((n) => n.visibility === "private");
  const title = isMentor
    ? `Mentoring ${pairing.mentee.name}`
    : `Mentored by ${pairing.mentor.name}`;

  return (
    <div className="page-container flex flex-col gap-8 py-8 lg:py-12">
      <Breadcrumbs items={[{ label: "Mentoring", href: "/mentoring" }, { label: title }]} />
      <header className="flex flex-col gap-2">
        <h1 className="text-title font-semibold">{title}</h1>
        <p className="text-text-secondary">
          {pairing.departmentName} · since {formatDate(pairing.startedAt)}
        </p>
        {!active ? <StatusBadge tone="neutral">Ended: kept for reference</StatusBadge> : null}
      </header>

      <section aria-labelledby="goals-heading" className="flex max-w-3xl flex-col gap-3">
        <h2 id="goals-heading" className="text-heading font-semibold">
          Goals
        </h2>
        {goals.length === 0 ? (
          <p className="text-small text-text-secondary">No goals yet. Add the first one below.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-card border border-border">
            {goals.map((goal) => (
              <li
                key={goal.id}
                className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="flex flex-col">
                  <span
                    className={
                      goal.status === "done" ? "text-text-muted line-through" : "font-medium"
                    }
                  >
                    {goal.title}
                  </span>
                  <span className="text-small text-text-muted">
                    {goal.status === "done" && goal.completedAt
                      ? `Done ${formatDate(goal.completedAt)}`
                      : goal.dueOn
                        ? `${goalOverdue(goal, today) ? "Overdue: was due" : "Due"} ${formatDate(`${goal.dueOn}T12:00:00Z`)}`
                        : "No due date"}
                  </span>
                </span>
                {active ? (
                  <ActionForm
                    action={setGoalStatusAction}
                    submitLabel={goal.status === "done" ? "Reopen" : "Mark done"}
                    pendingLabel="Saving…"
                    variant="tertiary"
                    hidden={{ goalId: goal.id, status: goal.status === "done" ? "open" : "done" }}
                    srLabel={goal.title}
                    className="flex"
                  />
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {active ? (
          <div className="rounded-card border border-dashed border-border p-5">
            <ActionForm
              action={addGoalAction}
              submitLabel="Add goal"
              pendingLabel="Adding…"
              variant="secondary"
              hidden={{ relationshipId: pairing.id }}
              className="flex flex-col gap-3"
            >
              <Field id="goal-title" label="Goal">
                <input
                  id="goal-title"
                  name="title"
                  required
                  maxLength={200}
                  className={fieldClasses}
                />
              </Field>
              <Field id="goal-due" label="Follow up by (optional)">
                <input id="goal-due" name="dueOn" type="date" className={`${fieldClasses} w-48`} />
              </Field>
            </ActionForm>
          </div>
        ) : null}
      </section>

      <section aria-labelledby="shared-heading" className="flex max-w-3xl flex-col gap-3">
        <h2 id="shared-heading" className="text-heading font-semibold">
          Shared notes
        </h2>
        <p className="text-small text-text-secondary">
          Seen by both of you and the department&apos;s leaders.
        </p>
        {active ? (
          <ActionForm
            action={addNoteAction}
            submitLabel="Share note"
            pendingLabel="Saving…"
            variant="secondary"
            hidden={{ relationshipId: pairing.id, visibility: "shared" }}
          >
            <Field id="shared-note" label="New shared note">
              <textarea
                id="shared-note"
                name="body"
                rows={3}
                required
                maxLength={4000}
                className={`${fieldClasses} py-3`}
              />
            </Field>
          </ActionForm>
        ) : null}
        {shared.length > 0 ? (
          <ol className="flex flex-col gap-3">
            {shared.map((note) => (
              <li
                key={note.id}
                className="flex flex-col gap-1 rounded-card border border-border p-4"
              >
                <span className="text-small text-text-muted">
                  {nameOf(note.authorId)} · {formatDateTime(note.createdAt)}
                </span>
                <p className="whitespace-pre-line">{note.body}</p>
              </li>
            ))}
          </ol>
        ) : null}
      </section>

      {canPrivate ? (
        <section aria-labelledby="private-heading" className="flex max-w-3xl flex-col gap-3">
          <h2 id="private-heading" className="flex items-center gap-2 text-heading font-semibold">
            <LockIcon className="size-5 text-text-muted" />
            Your private notes
          </h2>
          <p className="text-small text-text-secondary">
            Only you can read these. They never appear in reports or exports.
          </p>
          {active ? (
            <ActionForm
              action={addNoteAction}
              submitLabel="Save privately"
              pendingLabel="Saving…"
              variant="secondary"
              hidden={{ relationshipId: pairing.id, visibility: "private" }}
            >
              <Field id="private-note" label="New private note">
                <textarea
                  id="private-note"
                  name="body"
                  rows={3}
                  required
                  maxLength={4000}
                  className={`${fieldClasses} py-3`}
                />
              </Field>
            </ActionForm>
          ) : null}
          {mine.length > 0 ? (
            <ol className="flex flex-col gap-3">
              {mine.map((note) => (
                <li
                  key={note.id}
                  className="flex flex-col gap-1 rounded-card border border-border p-4"
                >
                  <span className="text-small text-text-muted">
                    {formatDateTime(note.createdAt)}
                  </span>
                  <p className="whitespace-pre-line">{note.body}</p>
                </li>
              ))}
            </ol>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function PairingSkeleton() {
  return (
    <div className="page-container flex flex-col gap-8 py-8 lg:py-12" aria-busy="true">
      <LoadingStatus label="Loading mentoring…" />
      <Skeleton className="h-10 w-72" />
      <Skeleton className="h-48 max-w-3xl" />
    </div>
  );
}
