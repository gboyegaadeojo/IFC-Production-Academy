import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { RequestList } from "@/components/copyright/request-list";
import { ActionForm } from "@/components/ui/action-form";
import { fieldClasses } from "@/components/ui/field-classes";
import { Tabs } from "@/components/ui/tabs";
import { getAdminAccess } from "@/lib/data/admin/access";
import { getCopyrightAdmin, type CopyrightAdmin } from "@/lib/data/copyright-admin";
import { AccessDenied } from "../access-denied";
import { PageSkeleton } from "../page-skeleton";
import { addContactAction, removeContactAction, saveSettingsAction } from "./actions";
import { TemplateEditor } from "./template-editor";

export const metadata: Metadata = { title: "Video and graphics approvals" };

const VIEWS = ["form", "emails", "requests"] as const;
type View = (typeof VIEWS)[number];

export default function CopyrightAdminPage({ searchParams }: PageProps<"/admin/copyright">) {
  return (
    <Suspense fallback={<PageSkeleton label="Loading approvals…" />}>
      <CopyrightAdminContent searchParams={searchParams} />
    </Suspense>
  );
}

/**
 * Admin → Video and graphics approvals (ADD-COPY-09; decision 2026-11-12), in three tabs as the
 * mock has them (board 16, G 2026-11-13): Form and reviewers, Emails, and All requests. Each tab
 * has its own address, so a saved change comes back to the same tab. Changes are in the audit log.
 */
async function CopyrightAdminContent({
  searchParams,
}: Pick<PageProps<"/admin/copyright">, "searchParams">) {
  const params = await searchParams;
  const view: View = VIEWS.find((v) => v === params.tab) ?? "form";
  const { allowed } = await getAdminAccess("copyright");
  if (!allowed) {
    return <AccessDenied />;
  }
  const admin = await getCopyrightAdmin();
  if (!admin) {
    return <AccessDenied />;
  }
  const { settings } = admin;
  const qualityControl = admin.contacts.filter((c) => c.kind === "quality_control");
  const outside = admin.contacts.filter((c) => c.kind === "reviewer");

  return (
    <div className="flex flex-col gap-6">
      <header className="flex max-w-3xl flex-col gap-3">
        <h1 className="text-title font-semibold">Video and graphics approvals</h1>
        <p className="text-text-secondary">
          Anyone asks to show a video or graphic on a livestream from the public form. Quality
          control checks every request first, and sends some for a copyright review. Neither needs
          an Academy account: they work from private links in their email.
        </p>
        <p
          role="status"
          className={`rounded-button border px-4 py-3 text-small ${
            admin.on ? "border-success-line bg-success-soft" : "border-warning-line bg-warning-soft"
          }`}
        >
          {admin.on ? (
            <>
              <strong>Approvals are on.</strong> The public form is open at{" "}
              <Link href="/media-request" className="underline">
                /media-request
              </Link>
              .
            </>
          ) : (
            <>
              <strong>Approvals are off.</strong> The form says requests are paused and nothing is
              emailed. When the lists and emails are ready, turn on{" "}
              <em>Video and graphics approvals</em> in{" "}
              <Link href="/admin/features" className="underline">
                Features
              </Link>
              .
            </>
          )}
        </p>
      </header>

      <Tabs
        label="Approvals settings"
        tabs={[
          { href: "/admin/copyright", label: "Form and reviewers", current: view === "form" },
          { href: "/admin/copyright?tab=emails", label: "Emails", current: view === "emails" },
          {
            href: "/admin/copyright?tab=requests",
            label: "All requests",
            count: admin.requests.length,
            current: view === "requests",
          },
        ]}
      />

      {view === "form" ? (
        <>
          <SettingsSection admin={admin} />
          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
            <section
              aria-labelledby="qc-heading"
              className="flex flex-col gap-3 rounded-card border border-border bg-surface p-5"
            >
              <h2 id="qc-heading" className="text-heading font-semibold">
                Quality control
              </h2>
              <Contacts
                kind="quality_control"
                intro="No Academy account needed. Every new request is emailed to each of them with a private link to their open requests. Removing someone stops their links straight away."
                contacts={qualityControl}
              />
            </section>
            <section
              aria-labelledby="reviewers-heading"
              className="flex flex-col gap-4 rounded-card border border-border bg-surface p-5"
            >
              <h2 id="reviewers-heading" className="text-heading font-semibold">
                Copyright reviewers
              </h2>
              <div className="flex flex-col gap-2">
                <h3 className="font-semibold">In the Academy</h3>
                <p className="text-small text-text-secondary">
                  People with the Copyright Reviewer role see Copyright in their side bar, and under
                  Serve on a phone. Give the role in{" "}
                  <Link href="/admin/people" className="underline">
                    People and roles
                  </Link>
                  .
                </p>
                {admin.members.length > 0 ? (
                  <ul className="flex flex-col divide-y divide-border">
                    {admin.members.map((member) => (
                      <li key={member.id} className="py-2">
                        {member.name}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-small text-text-muted">Nobody has the role yet.</p>
                )}
              </div>
              <div className="flex flex-col gap-2 border-t border-border pt-4">
                <h3 className="font-semibold">Outside the Academy</h3>
                <Contacts
                  kind="reviewer"
                  intro="They review from a private link to one request, which stops once it's decided or after 14 days."
                  contacts={outside}
                />
              </div>
            </section>
          </div>
        </>
      ) : null}

      {view === "emails" ? (
        <section aria-labelledby="emails-heading" className="flex flex-col gap-4">
          <h2 id="emails-heading" className="sr-only">
            Emails
          </h2>
          <p className="max-w-3xl text-small text-text-secondary">
            Six emails, each with fill-ins in braces such as {"{first name}"}. Keep &quot;Approved
            media:&quot; at the start of Cleared to show if a Gmail label sorts them.
          </p>
          <TemplateEditor templates={settings.templates} saved={settings.savedTemplates} />
        </section>
      ) : null}

      {view === "requests" ? (
        <section aria-labelledby="requests-heading" className="flex flex-col gap-3">
          <h2 id="requests-heading" className="sr-only">
            All requests
          </h2>
          <RequestList
            requests={admin.requests}
            hrefFor={(id) => `/admin/copyright/requests/${id}`}
            empty="No requests yet."
          />
        </section>
      ) : null}
    </div>
  );
}

/** A list of people by email, with Remove, and a row to add someone. */
function Contacts({
  kind,
  intro,
  contacts,
}: {
  kind: "quality_control" | "reviewer";
  intro: string;
  contacts: CopyrightAdmin["contacts"];
}) {
  return (
    <>
      <p className="text-small text-text-secondary">{intro}</p>
      {contacts.length > 0 ? (
        <ul className="flex flex-col divide-y divide-border">
          {contacts.map((contact) => (
            <li key={contact.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                {contact.name}
                <span className="block text-small text-text-muted">{contact.email}</span>
              </span>
              <ActionForm
                action={removeContactAction}
                hidden={{ id: contact.id }}
                submitLabel="Remove"
                pendingLabel="Removing…"
                variant="tertiary"
                srLabel={contact.name}
                className="flex items-center gap-2"
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-small text-text-muted">Nobody yet.</p>
      )}
      <ActionForm
        action={addContactAction}
        hidden={{ kind }}
        submitLabel="Add"
        pendingLabel="Adding…"
        variant="secondary"
        className="flex flex-wrap items-end gap-2"
      >
        <label className="flex flex-col gap-1 text-small font-medium text-text-secondary">
          Name
          <input name="name" required maxLength={80} className={`${fieldClasses} w-40`} />
        </label>
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-small font-medium text-text-secondary">
          Email
          <input name="email" type="email" required maxLength={254} className={fieldClasses} />
        </label>
      </ActionForm>
    </>
  );
}

const CARD = "flex flex-col gap-4 rounded-card border border-border bg-surface p-5";
const LABEL = "flex flex-col gap-1.5 text-small font-medium text-text-secondary";

/**
 * The form, the deadline, the checks and what happens on approval: four cards in two columns,
 * one form saved together.
 */
function SettingsSection({ admin }: { admin: CopyrightAdmin }) {
  const { settings } = admin;
  return (
    <ActionForm
      action={saveSettingsAction}
      submitLabel="Save settings"
      className="flex flex-col gap-4"
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section aria-labelledby="form-heading" className={CARD}>
          <h2 id="form-heading" className="text-heading font-semibold">
            The public form
          </h2>
          <p className="text-small text-text-secondary">
            Anyone can ask from{" "}
            <Link href="/media-request" className="font-medium text-accent-light underline">
              /media-request
            </Link>
            , with no account.
          </p>
          <label className={LABEL}>
            Introduction (optional; {"{deadline}"} becomes the deadline)
            <textarea
              name="introText"
              rows={4}
              maxLength={1000}
              defaultValue={settings.introText}
              placeholder="Everything shown during a livestream is checked for copyright first. Send it at least {deadline} before the service and we'll email you the answer."
              className={`${fieldClasses} py-2`}
            />
          </label>
        </section>

        <section aria-labelledby="deadline-heading" className={CARD}>
          <h2 id="deadline-heading" className="text-heading font-semibold">
            Deadline
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[8rem_minmax(0,1fr)]">
            <label className={LABEL}>
              Days before
              <input
                name="deadlineDays"
                type="number"
                min={0}
                max={60}
                required
                defaultValue={settings.deadlineDays}
                className={fieldClasses}
              />
            </label>
            <label className={LABEL}>
              Counting
              <select
                name="deadlineCounting"
                defaultValue={settings.deadlineCounting}
                className={fieldClasses}
              >
                <option value="calendar">Calendar days</option>
                <option value="business">Business days (Monday to Friday)</option>
              </select>
            </label>
          </div>
          <label className={LABEL}>
            When a request is later than that
            <select name="latePolicy" defaultValue={settings.latePolicy} className={fieldClasses}>
              <option value="accept">Accept it, marked Late</option>
              <option value="block">Refuse it</option>
            </select>
          </label>
        </section>

        <section aria-labelledby="checks-heading" className={CARD}>
          <h2 id="checks-heading" className="text-heading font-semibold">
            Checks reviewers tick
          </h2>
          <label className={LABEL}>
            One per line, up to 10. They help people decide; they don&apos;t decide.
            <textarea
              name="checks"
              rows={4}
              defaultValue={settings.checks.join("\n")}
              className={`${fieldClasses} py-2`}
            />
          </label>
        </section>

        <section aria-labelledby="approved-heading" className={CARD}>
          <h2 id="approved-heading" className="text-heading font-semibold">
            When something is approved
          </h2>
          <p className="text-small text-text-secondary">
            Everyone scheduled on that service sees it in the Academy when they sign in, whatever
            their position.
          </p>
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              name="mediaInboxOn"
              defaultChecked={settings.mediaInboxOn}
              className="size-4 accent-[var(--accent)]"
            />
            Email the media inbox
          </label>
          <label className={LABEL}>
            Media inbox address
            <input
              name="mediaInboxEmail"
              type="email"
              maxLength={254}
              defaultValue={settings.mediaInboxEmail ?? ""}
              className={fieldClasses}
            />
          </label>
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              name="emailOnDuty"
              defaultChecked={settings.emailOnDuty}
              className="size-4 accent-[var(--accent)]"
            />
            Also email everyone on duty that day
          </label>
        </section>
      </div>
    </ActionForm>
  );
}
