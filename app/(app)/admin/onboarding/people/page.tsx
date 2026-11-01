import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { QrCode } from "@/components/qr-code";
import { ActionForm, Field, fieldClasses } from "@/components/ui/action-form";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { getAdminAccess } from "@/lib/data/admin/access";
import {
  getEntryDetail,
  getPathways,
  getPeopleInPathways,
  type PersonInPathway,
} from "@/lib/data/onboarding";
import { formatDateTime } from "@/lib/domain/admin";
import { cameInByLabel, eventLabel } from "@/lib/domain/onboarding";
import { initials } from "@/lib/domain/people";
import { publicEnv } from "@/lib/env";
import { AccessDenied } from "../../access-denied";
import { PageSkeleton } from "../../page-skeleton";
import { addNoteAction, addPersonAction, stopEntryAction } from "../running-actions";

export const metadata: Metadata = { title: "People in pathways" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function PeopleInPathwaysPage({
  searchParams,
}: PageProps<"/admin/onboarding/people">) {
  return (
    <Suspense fallback={<PageSkeleton label="Loading people in pathways…" />}>
      <PeopleContent searchParams={searchParams} />
    </Suspense>
  );
}

/** How long someone has been at their step: "today", "1 day", "4 days". */
function waited(since: string, now: Date): { label: string; days: number } {
  const days = Math.floor((now.getTime() - Date.parse(since)) / 86_400_000);
  return { label: days <= 0 ? "today" : days === 1 ? "1 day" : `${days} days`, days };
}

/**
 * Who's in which pathway, where they are, and for how long (approved mock, 2026-11-01). Opening a
 * person shows their history and notes; private notes are visible to their author only.
 */
async function PeopleContent({
  searchParams,
}: Pick<PageProps<"/admin/onboarding/people">, "searchParams">) {
  const { grants, allowed } = await getAdminAccess("onboarding-people");
  if (!allowed) {
    return <AccessDenied />;
  }
  const params = await searchParams;
  const entryParam =
    typeof params.entry === "string" && UUID.test(params.entry) ? params.entry : null;
  const showDone = params.show === "done";
  const [people, { pathways }] = await Promise.all([getPeopleInPathways(), getPathways(grants)]);
  const shown = people.filter((p) => (showDone ? p.status !== "active" : p.status === "active"));
  const open = entryParam ? (people.find((p) => p.entryId === entryParam) ?? null) : null;
  const detail = open ? await getEntryDetail(open.entryId) : null;
  const now = new Date();
  const signUpUrl = `${publicEnv().NEXT_PUBLIC_SITE_URL.replace(/\/+$/, "")}/serve-with-us`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="People & Teams"
        title="People in pathways"
        description="Who's where, how long they've been there, and what happens next. Open someone for their history and notes."
      />

      <details className="max-w-xl rounded-card border border-border bg-surface p-4">
        <summary className="cursor-pointer font-medium">Share the sign-up page</summary>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <QrCode value={signUpUrl} label="QR code for the “I want to serve” page" size={140} />
          <div className="flex min-w-0 flex-col gap-1 text-small">
            <span className="text-text-secondary">
              Print it for the lobby or show it at a volunteer night.
            </span>
            <a
              href="/serve-with-us"
              className="font-medium break-all text-accent-light underline-offset-4 hover:underline"
            >
              {signUpUrl}
            </a>
          </div>
        </div>
      </details>

      {pathways.length > 0 ? (
        <details className="max-w-xl rounded-card border border-border bg-surface p-4">
          <summary className="cursor-pointer font-medium">Add someone</summary>
          <p className="mt-2 text-small text-text-secondary">
            For someone you met in the lobby. They start at the pathway&apos;s first step. No email
            is sent until volunteer emails are switched on.
          </p>
          <ActionForm
            action={addPersonAction}
            submitLabel="Add to pathway"
            className="mt-3 flex flex-col gap-3"
          >
            <Field id="add-pathway" label="Pathway">
              <select id="add-pathway" name="pathwayId" className={fieldClasses}>
                {pathways.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="add-name" label="Their name">
              <input
                id="add-name"
                name="name"
                required
                maxLength={120}
                autoComplete="off"
                className={fieldClasses}
              />
            </Field>
            <Field id="add-email" label="Their email">
              <input
                id="add-email"
                name="email"
                type="email"
                required
                maxLength={254}
                autoComplete="off"
                className={fieldClasses}
              />
            </Field>
          </ActionForm>
        </details>
      ) : null}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_26rem]">
        <section
          aria-labelledby="people-heading"
          className="overflow-hidden rounded-card border border-border bg-surface"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
            <h2 id="people-heading" className="font-semibold">
              {showDone ? "Finished or stopped" : "In progress"}
            </h2>
            <nav
              aria-label="Which people"
              className="flex gap-0.5 rounded-button border border-border bg-card p-[3px]"
            >
              {[
                { done: false, label: "In progress" },
                { done: true, label: "Finished or stopped" },
              ].map((tab) => (
                <Link
                  key={tab.label}
                  href={
                    tab.done ? "/admin/onboarding/people?show=done" : "/admin/onboarding/people"
                  }
                  aria-current={showDone === tab.done ? "page" : undefined}
                  className="flex min-h-9 items-center rounded-[7px] px-3 text-small text-text-secondary hover:text-text aria-[current=page]:bg-surface aria-[current=page]:font-semibold aria-[current=page]:text-text aria-[current=page]:shadow-[0_0_0_1px_var(--border)]"
                >
                  {tab.label}
                </Link>
              ))}
            </nav>
          </div>
          {shown.length === 0 ? (
            <p className="px-4 py-8 text-center text-small text-text-secondary">
              {showDone
                ? "Nobody has finished yet."
                : "Nobody is onboarding right now. People appear here when they use the “I want to serve” page, join a department, or you add them."}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {shown.map((person) => (
                <PersonRow
                  key={person.entryId}
                  person={person}
                  now={now}
                  selected={person.entryId === open?.entryId}
                  showDone={showDone}
                />
              ))}
            </ul>
          )}
        </section>

        {open && detail ? (
          <section
            aria-labelledby="person-heading"
            className="flex flex-col gap-5 rounded-card border border-border bg-surface p-4 xl:sticky xl:top-6"
          >
            <div className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className="flex size-10 items-center justify-center rounded-pill bg-accent-soft text-small font-semibold text-accent-light"
              >
                {initials(open.name)}
              </span>
              <div className="flex min-w-0 flex-col">
                <h2 id="person-heading" className="truncate font-semibold">
                  {open.name}
                </h2>
                <span className="truncate text-small text-text-muted">
                  {open.pathwayName}
                  {open.stepTitle ? ` · now at ${open.stepTitle}` : ""}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <h3 className="text-small font-semibold">History</h3>
              <ol className="flex flex-col gap-2.5 border-l-2 border-border pl-4">
                {detail.events.map((event) => (
                  <li key={event.id} className="relative text-small">
                    <span
                      aria-hidden="true"
                      className="absolute top-1 -left-[1.4rem] size-2.5 rounded-pill bg-accent"
                    />
                    <span className="block text-text">{eventLabel(event.kind, event.detail)}</span>
                    <time dateTime={event.at} className="text-text-muted">
                      {formatDateTime(event.at)}
                      {event.actor ? ` · ${event.actor}` : ""}
                    </time>
                  </li>
                ))}
              </ol>
            </div>

            <div className="flex flex-col gap-2">
              <h3 className="text-small font-semibold">Notes</h3>
              {detail.notes.length === 0 ? (
                <p className="text-small text-text-muted">No notes yet.</p>
              ) : null}
              <ul className="flex flex-col gap-2">
                {detail.notes.map((note) => (
                  <li
                    key={note.id}
                    className={`rounded-button border p-2.5 text-small ${note.visibility === "private" ? "border-dashed border-warning-line bg-warning-soft" : "border-border bg-card"}`}
                  >
                    <p className="whitespace-pre-line text-text">{note.body}</p>
                    <p className="mt-1 text-text-muted">
                      {note.author} · {formatDateTime(note.at)}
                      {note.visibility === "private" ? " · private, only you" : ""}
                    </p>
                  </li>
                ))}
              </ul>
              <ActionForm
                action={addNoteAction}
                submitLabel="Save note"
                hidden={{ entryId: open.entryId }}
                className="flex flex-col gap-2"
              >
                <Field id="note-body" label="Add a note">
                  <textarea
                    id="note-body"
                    name="body"
                    required
                    maxLength={2000}
                    rows={3}
                    className={`${fieldClasses} py-2`}
                  />
                </Field>
                <fieldset className="flex flex-wrap gap-4 text-small">
                  <legend className="sr-only">Who can read it</legend>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="visibility"
                      value="shared"
                      defaultChecked
                      className="accent-[var(--accent)]"
                    />
                    Shared with leaders who look after this pathway
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="visibility"
                      value="private"
                      className="accent-[var(--accent)]"
                    />
                    Private, only me
                  </label>
                </fieldset>
              </ActionForm>
            </div>

            {open.status === "active" ? (
              <ConfirmDialog
                triggerLabel="Stop their onboarding"
                srLabel={open.name}
                variant="secondary"
                title={`Stop ${open.name}'s onboarding?`}
                message="For when they've changed their mind. Their history and notes are kept, and you can add them again later."
              >
                <ActionForm
                  action={stopEntryAction}
                  submitLabel="Stop onboarding"
                  variant="destructive"
                  hidden={{ entryId: open.entryId }}
                />
              </ConfirmDialog>
            ) : null}
          </section>
        ) : null}
      </div>
    </div>
  );
}

function PersonRow({
  person,
  now,
  selected,
  showDone,
}: {
  person: PersonInPathway;
  now: Date;
  selected: boolean;
  showDone: boolean;
}) {
  const wait = waited(person.stepStartedAt, now);
  const overdue =
    person.status === "active" &&
    (person.stepKind === "task" || person.stepKind === "mentor") &&
    wait.days >= 3;
  return (
    <li>
      <Link
        href={`/admin/onboarding/people?entry=${person.entryId}${showDone ? "&show=done" : ""}`}
        scroll={false}
        aria-current={selected ? "true" : undefined}
        className="grid grid-cols-[2.25rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2 px-4 py-3 transition-surface hover:bg-hover aria-[current=true]:bg-accent-soft md:grid-cols-[2.25rem_minmax(0,1.2fr)_minmax(0,1fr)_auto]"
      >
        <span
          aria-hidden="true"
          className="flex size-9 items-center justify-center rounded-pill bg-accent-soft text-small font-semibold text-accent-light"
        >
          {initials(person.name)}
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-semibold">{person.name}</span>
          <span className="truncate text-small text-text-muted">
            {person.pathwayName} · came in through {cameInByLabel(person.cameInBy)}
          </span>
        </span>
        <span className="col-start-2 flex min-w-0 flex-col gap-1 md:col-start-auto">
          <span className="truncate text-small">
            {person.status === "active"
              ? (person.stepTitle ?? "Starting")
              : person.status === "finished"
                ? "Finished"
                : "Stopped"}
          </span>
          <span aria-hidden="true" className="flex gap-0.5">
            {Array.from({ length: Math.max(person.total, 1) }, (_, i) => (
              <span
                key={i}
                className={`h-1.5 w-3 rounded-[3px] ${i < person.position ? "bg-success" : i === person.position && person.status === "active" ? "bg-accent" : "bg-hover"}`}
              />
            ))}
          </span>
          <span className="sr-only">
            Step {Math.min(person.position + 1, person.total)} of {person.total}
          </span>
        </span>
        <span className="col-start-2 md:col-start-auto">
          {person.status !== "active" ? (
            <StatusBadge tone={person.status === "finished" ? "success" : "neutral"}>
              {person.status === "finished" ? "Finished" : "Stopped"}
            </StatusBadge>
          ) : overdue ? (
            <StatusBadge tone="pending">Waiting {wait.label}</StatusBadge>
          ) : (
            <span className="text-small text-text-muted">Waiting {wait.label}</span>
          )}
        </span>
      </Link>
    </li>
  );
}
