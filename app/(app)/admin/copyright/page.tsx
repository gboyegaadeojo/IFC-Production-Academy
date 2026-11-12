import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { RequestList } from "@/components/copyright/request-list";
import { ActionForm } from "@/components/ui/action-form";
import { fieldClasses } from "@/components/ui/field-classes";
import { getAdminAccess } from "@/lib/data/admin/access";
import { getCopyrightAdmin, type CopyrightAdmin } from "@/lib/data/copyright-admin";
import { AccessDenied } from "../access-denied";
import { PageSkeleton } from "../page-skeleton";
import { addContactAction, removeContactAction, saveSettingsAction } from "./actions";
import { TemplateEditor } from "./template-editor";

export const metadata: Metadata = { title: "Video and graphics approvals" };

export default function CopyrightAdminPage() {
  return (
    <Suspense fallback={<PageSkeleton label="Loading approvals…" />}>
      <CopyrightAdminContent />
    </Suspense>
  );
}

/**
 * Admin → Video and graphics approvals (ADD-COPY-09; decision 2026-11-12): the form and deadline,
 * Quality control and outside reviewers, what happens on approval, the six emails, and every
 * request. Changes are in the audit log.
 */
async function CopyrightAdminContent() {
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
    <div className="flex flex-col gap-8">
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
              emailed. When the lists and emails below are ready, turn on{" "}
              <em>Video and graphics approvals</em> in{" "}
              <Link href="/admin/features" className="underline">
                Features
              </Link>
              .
            </>
          )}
        </p>
      </header>

      <ContactSection
        title="Quality control"
        kind="quality_control"
        intro="Every new request is emailed to each of them with a private link to their open requests. Removing someone stops their links straight away."
        contacts={qualityControl}
      />

      <section aria-labelledby="reviewers-heading" className="flex flex-col gap-4">
        <h2 id="reviewers-heading" className="text-heading font-semibold">
          Copyright reviewers
        </h2>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="flex flex-col gap-3 rounded-card border border-border bg-surface p-5">
            <h3 className="font-semibold">In the Academy</h3>
            <p className="text-small text-text-secondary">
              People with the Copyright Reviewer role see Copyright in their side bar. Give the role
              in{" "}
              <Link href="/admin/people" className="underline">
                People and roles
              </Link>
              .
            </p>
            {admin.members.length > 0 ? (
              <ul className="flex flex-col gap-1">
                {admin.members.map((member) => (
                  <li key={member.id}>{member.name}</li>
                ))}
              </ul>
            ) : (
              <p className="text-small text-text-muted">Nobody has the role yet.</p>
            )}
          </div>
          <ContactSection
            title="Outside the Academy"
            kind="reviewer"
            intro="They review from a private link to one request, which stops once it's decided or after 14 days."
            contacts={outside}
            nested
          />
        </div>
      </section>

      <SettingsSection admin={admin} />

      <section aria-labelledby="emails-heading" className="flex flex-col gap-4">
        <div className="flex max-w-3xl flex-col gap-2">
          <h2 id="emails-heading" className="text-heading font-semibold">
            Emails
          </h2>
          <p className="text-small text-text-secondary">
            Six emails, each with fill-ins in braces such as {"{first name}"}. Keep &quot;Approved
            media:&quot; at the start of Cleared to show if a Gmail label sorts them.
          </p>
        </div>
        <TemplateEditor templates={settings.templates} saved={settings.savedTemplates} />
      </section>

      <section aria-labelledby="requests-heading" className="flex flex-col gap-3">
        <h2 id="requests-heading" className="text-heading font-semibold">
          All requests
        </h2>
        <RequestList
          requests={admin.requests}
          hrefFor={(id) => `/admin/copyright/requests/${id}`}
          empty="No requests yet."
        />
      </section>
    </div>
  );
}

function ContactSection({
  title,
  kind,
  intro,
  contacts,
  nested = false,
}: {
  title: string;
  kind: "quality_control" | "reviewer";
  intro: string;
  contacts: CopyrightAdmin["contacts"];
  nested?: boolean;
}) {
  const Heading = nested ? "h3" : "h2";
  return (
    <section
      aria-label={title}
      className="flex flex-col gap-3 rounded-card border border-border bg-surface p-5"
    >
      <Heading className={nested ? "font-semibold" : "text-heading font-semibold"}>{title}</Heading>
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
    </section>
  );
}

function SettingsSection({ admin }: { admin: CopyrightAdmin }) {
  const { settings } = admin;
  return (
    <section aria-labelledby="settings-heading" className="flex flex-col gap-4">
      <h2 id="settings-heading" className="text-heading font-semibold">
        The form, the deadline, and what happens on approval
      </h2>
      <ActionForm
        action={saveSettingsAction}
        submitLabel="Save settings"
        className="flex flex-col gap-5 rounded-card border border-border bg-surface p-5"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[8rem_minmax(0,1fr)_minmax(0,1fr)]">
          <label className="flex flex-col gap-1.5 text-small font-medium text-text-secondary">
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
          <label className="flex flex-col gap-1.5 text-small font-medium text-text-secondary">
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
          <label className="flex flex-col gap-1.5 text-small font-medium text-text-secondary">
            When a request is later than that
            <select name="latePolicy" defaultValue={settings.latePolicy} className={fieldClasses}>
              <option value="accept">Accept it, marked Late</option>
              <option value="block">Refuse it</option>
            </select>
          </label>
        </div>
        <label className="flex flex-col gap-1.5 text-small font-medium text-text-secondary">
          Form introduction (optional; {"{deadline}"} becomes the deadline)
          <textarea
            name="introText"
            rows={2}
            maxLength={1000}
            defaultValue={settings.introText}
            placeholder="Everything shown during a livestream is checked for copyright first. Send it at least {deadline} before the service and we'll email you the answer."
            className={`${fieldClasses} py-2`}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-small font-medium text-text-secondary">
          Checks reviewers tick, one per line (up to 10). They help people decide; they don&apos;t
          decide.
          <textarea
            name="checks"
            rows={4}
            defaultValue={settings.checks.join("\n")}
            className={`${fieldClasses} py-2`}
          />
        </label>
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 font-semibold">When something is approved</legend>
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
          <label className="flex max-w-md flex-col gap-1.5 text-small font-medium text-text-secondary">
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
        </fieldset>
      </ActionForm>
    </section>
  );
}
