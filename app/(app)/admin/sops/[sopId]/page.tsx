import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ActionForm, Field, fieldClasses } from "@/components/ui/action-form";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { StatusBadge } from "@/components/ui/status-badge";
import { getAdminAccess } from "@/lib/data/admin/access";
import { getSop, sopTitle } from "@/lib/data/sops";
import { formatDate } from "@/lib/domain/dates";
import { hasCapability } from "@/lib/domain/capabilities";
import {
  formatFileSize,
  REVIEW_INTERVALS,
  reviewDueAt,
  SOP_STATE_LABELS,
  SOP_VERSION_LABELS,
} from "@/lib/domain/sops";
import { AccessDenied } from "../../access-denied";
import { PageSkeleton } from "../../page-skeleton";
import {
  archiveSopAction,
  markSopReviewedAction,
  publishSopAction,
  startSopDraftAction,
  updateSopDraftAction,
  updateSopSettingsAction,
  uploadSopFileAction,
} from "../actions";

export const metadata: Metadata = { title: "SOP" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Props = PageProps<"/admin/sops/[sopId]">;

export default function AdminSopPage({ params }: Props) {
  return (
    <Suspense fallback={<PageSkeleton label="Loading the SOP…" />}>
      <AdminSopContent params={params} />
    </Suspense>
  );
}

/**
 * Maintain an SOP (SPEC §3 workflow E): edit a draft, upload its file, publish it as the current
 * version, confirm reviews, and archive. Published versions never change (SRS-SOP-002).
 */
async function AdminSopContent({ params }: Pick<Props, "params">) {
  const { grants, allowed } = await getAdminAccess("sops");
  if (!allowed) {
    return <AccessDenied />;
  }
  const { sopId } = await params;
  if (!UUID.test(sopId)) {
    notFound();
  }
  const sop = await getSop(sopId);
  if (!sop) {
    notFound();
  }
  const canDraft = hasCapability(grants, "course.draft", sop.department.id);
  const canPublish = hasCapability(grants, "course.publish", sop.department.id);
  const archived = sop.archivedAt !== null;
  const draft = !archived && canDraft ? sop.draft : null;
  const due = reviewDueAt(sop.lastReviewedAt, sop.reviewIntervalMonths);
  const title = sopTitle(sop);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <Breadcrumbs items={[{ label: "SOP library", href: "/admin/sops" }, { label: title }]} />
        <p className="eyebrow">{sop.department.name}</p>
        <h1 className="text-title font-semibold">{title}</h1>
        <div className="flex flex-wrap gap-2">
          <StatusBadge tone={sop.state === "current" ? "success" : "pending"}>
            {SOP_STATE_LABELS[sop.state]}
          </StatusBadge>
          {sop.current ? (
            <StatusBadge tone="neutral">Version {sop.current.versionNumber} is current</StatusBadge>
          ) : null}
          {sop.draft && !archived ? <StatusBadge tone="pending">Draft open</StatusBadge> : null}
        </div>
        <p className="text-small text-text-muted">
          {sop.lastReviewedAt
            ? `Last reviewed ${formatDate(sop.lastReviewedAt)}. Next review ${due ? formatDate(due.toISOString()) : "not set"}.`
            : "It counts as reviewed when you publish it."}
          {sop.ownerName ? ` Owner: ${sop.ownerName}.` : ""}
        </p>
      </header>

      {!archived && canDraft && !sop.draft ? (
        <div className="flex flex-col gap-1">
          <ActionForm
            action={startSopDraftAction}
            submitLabel="Edit SOP"
            pendingLabel="Starting a draft…"
            hidden={{ sopId: sop.id }}
          />
          <p className="text-small text-text-muted">
            Starts a draft from the current version. Members keep seeing the current one until you
            publish.
          </p>
        </div>
      ) : null}

      {draft ? (
        <>
          <section
            aria-labelledby="draft-heading"
            className="flex max-w-2xl flex-col gap-4 rounded-card border border-border bg-card p-5"
          >
            <h2 id="draft-heading" className="text-subheading font-semibold">
              Draft
            </h2>
            <ActionForm
              action={updateSopDraftAction}
              submitLabel="Save draft"
              hidden={{ versionId: draft.id }}
            >
              <Field id="sop-title" label="Title">
                <input
                  id="sop-title"
                  name="title"
                  required
                  maxLength={120}
                  defaultValue={draft.title}
                  className={fieldClasses}
                />
              </Field>
              <Field
                id="sop-summary"
                label="Summary"
                hint="What this procedure is for and when to use it."
              >
                <textarea
                  id="sop-summary"
                  name="summary"
                  rows={3}
                  maxLength={1000}
                  defaultValue={draft.summary}
                  aria-describedby="sop-summary-hint"
                  className={`${fieldClasses} py-3`}
                />
              </Field>
            </ActionForm>
          </section>

          <section
            aria-labelledby="file-heading"
            className="flex max-w-2xl flex-col gap-4 rounded-card border border-border bg-card p-5"
          >
            <h2 id="file-heading" className="text-subheading font-semibold">
              File
            </h2>
            {draft.fileName ? (
              <p className="text-text-secondary">
                {draft.fileName}
                {draft.fileSize ? ` · ${formatFileSize(draft.fileSize)}` : ""}
                {" · "}
                <a
                  href={`/sops/${sop.id}/file?version=${draft.id}`}
                  target="_blank"
                  rel="noopener"
                  className="text-accent-light underline-offset-4 hover:underline"
                >
                  Open<span className="sr-only"> the draft file (opens in a new tab)</span>
                </a>
              </p>
            ) : (
              <p className="text-text-secondary">No file yet. Upload one before publishing.</p>
            )}
            <ActionForm
              action={uploadSopFileAction}
              submitLabel={draft.fileName ? "Replace file" : "Upload file"}
              pendingLabel="Uploading…"
              variant="secondary"
              hidden={{ versionId: draft.id }}
            >
              <Field
                id="sop-file"
                label="SOP file"
                hint="A PDF, PNG, or JPEG, up to 10 MB. It's stored privately: only members of the department can open it."
              >
                <input
                  id="sop-file"
                  name="file"
                  type="file"
                  required
                  accept="application/pdf,image/png,image/jpeg"
                  aria-describedby="sop-file-hint"
                  className="text-small text-text-secondary file:mr-3 file:min-h-control file:rounded-button file:border file:border-border-strong file:bg-surface file:px-3 file:text-text"
                />
              </Field>
            </ActionForm>
          </section>

          {canPublish ? (
            <section
              aria-labelledby="publish-heading"
              className="flex max-w-2xl flex-col gap-4 rounded-card border border-border bg-card p-5"
            >
              <h2 id="publish-heading" className="text-subheading font-semibold">
                Publish
              </h2>
              <p className="text-text-secondary">
                The draft becomes the current version. The previous version is kept and marked
                Superseded, and the SOP counts as reviewed today.
              </p>
              <ActionForm
                action={publishSopAction}
                submitLabel="Publish"
                pendingLabel="Publishing…"
                hidden={{ versionId: draft.id }}
              >
                <Field
                  id="sop-change-note"
                  label="What changed?"
                  hint="Kept with the version, for example “Added the new camera presets”."
                >
                  <input
                    id="sop-change-note"
                    name="changeNote"
                    required
                    maxLength={500}
                    aria-describedby="sop-change-note-hint"
                    className={fieldClasses}
                  />
                </Field>
              </ActionForm>
            </section>
          ) : (
            <p className="max-w-2xl text-small text-text-muted">
              Someone with publishing rights for {sop.department.name} publishes the draft.
            </p>
          )}
        </>
      ) : null}

      {!archived && canDraft ? (
        <section
          aria-labelledby="settings-heading"
          className="flex max-w-2xl flex-col gap-4 rounded-card border border-border bg-card p-5"
        >
          <h2 id="settings-heading" className="text-subheading font-semibold">
            Settings
          </h2>
          <ActionForm
            action={updateSopSettingsAction}
            submitLabel="Save settings"
            hidden={{ sopId: sop.id }}
          >
            <Field
              id="sop-category"
              label="Category (optional)"
              hint="Groups SOPs in the library, for example “Service day” or “Checklists”."
            >
              <input
                id="sop-category"
                name="category"
                maxLength={60}
                defaultValue={sop.category}
                aria-describedby="sop-category-hint"
                className={fieldClasses}
              />
            </Field>
            <Field id="sop-interval" label="Review every">
              <select
                id="sop-interval"
                name="reviewIntervalMonths"
                defaultValue={String(sop.reviewIntervalMonths)}
                className={`${fieldClasses} w-40`}
              >
                {REVIEW_INTERVALS.map((months) => (
                  <option key={months} value={months}>
                    {months} months
                  </option>
                ))}
              </select>
            </Field>
          </ActionForm>
        </section>
      ) : null}

      {canPublish && !archived && sop.current ? (
        <section
          aria-labelledby="review-heading"
          className="flex max-w-2xl flex-col gap-3 rounded-card border border-border bg-card p-5"
        >
          <h2 id="review-heading" className="text-subheading font-semibold">
            Review
          </h2>
          <p className="text-text-secondary">
            Checked the current version and it&apos;s still right? Confirm the review without
            publishing a new version.
          </p>
          <ActionForm
            action={markSopReviewedAction}
            submitLabel="Mark as reviewed today"
            pendingLabel="Saving…"
            variant="secondary"
            hidden={{ sopId: sop.id }}
          />
        </section>
      ) : null}

      <section aria-labelledby="history-heading" className="flex flex-col gap-3">
        <h2 id="history-heading" className="text-heading font-semibold">
          Version history
        </h2>
        <ol className="flex max-w-3xl flex-col divide-y divide-border rounded-card border border-border">
          {sop.versions.map((version) => (
            <li key={version.id} className="flex flex-col gap-1 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">
                  {version.versionNumber ? `Version ${version.versionNumber}: ` : ""}
                  {version.title}
                </span>
                <StatusBadge
                  tone={
                    version.status === "published"
                      ? "success"
                      : version.status === "draft"
                        ? "pending"
                        : "neutral"
                  }
                >
                  {SOP_VERSION_LABELS[version.status]}
                </StatusBadge>
              </div>
              {version.changeNote ? (
                <p className="text-small whitespace-pre-line text-text-secondary">
                  {version.changeNote}
                </p>
              ) : null}
              <p className="text-small text-text-muted">
                {version.publishedAt
                  ? `Published ${formatDate(version.publishedAt)}`
                  : "Not published"}
                {version.fileName ? (
                  <>
                    {" · "}
                    <a
                      href={`/sops/${sop.id}/file?version=${version.id}`}
                      target="_blank"
                      rel="noopener"
                      className="text-accent-light underline-offset-4 hover:underline"
                    >
                      Open {version.fileName}
                      <span className="sr-only"> (opens in a new tab)</span>
                    </a>
                  </>
                ) : null}
              </p>
            </li>
          ))}
        </ol>
      </section>

      {canPublish && !archived ? (
        <details className="max-w-2xl rounded-card border border-border p-5">
          <summary className="flex min-h-control cursor-pointer items-center font-medium">
            Archive this SOP
          </summary>
          <p className="mt-2 text-text-secondary">
            Members stop seeing it, and lessons stop listing it. Its versions and files are kept.
          </p>
          <div className="mt-3">
            <ActionForm
              action={archiveSopAction}
              submitLabel="Archive SOP"
              pendingLabel="Archiving…"
              variant="destructive"
              hidden={{ sopId: sop.id }}
            />
          </div>
        </details>
      ) : null}
    </div>
  );
}
