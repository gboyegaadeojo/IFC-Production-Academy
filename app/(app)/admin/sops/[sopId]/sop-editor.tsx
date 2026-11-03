"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { ActionForm, type FormState, fieldClasses } from "@/components/ui/action-form";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { GuideContent } from "@/components/help/guide-content";
import { parseMarkdown } from "@/lib/domain/markdown";
import {
  boldSopText,
  formatSopLines,
  REVIEW_INTERVALS,
  SOP_TEMPLATE,
  type SopLineFormat,
} from "@/lib/domain/sops";
import {
  archiveSopAction,
  deleteSopAction,
  markSopReviewedAction,
  publishSopAction,
  removeSopFileAction,
  saveSopDraftAction,
  startSopDraftAction,
  updateSopSettingsAction,
  uploadSopFileAction,
} from "../actions";

const idle: FormState = { status: "idle" };
const panel = "flex flex-col gap-2.5 rounded-card border border-border bg-card p-3.5";
const compactField = `${fieldClasses} w-full text-button`;
// SOPs aren't guides, so a link in one can only go to a web address.
const NO_GUIDE = "";

type HistoryItem = {
  id: string;
  number: number | null;
  note: string | null;
  publishedAt: string | null;
  current: boolean;
  fileName: string | null;
  fileHref: string | null;
};

type Props = {
  sopId: string;
  audience: string;
  ownerName: string | null;
  archived: boolean;
  draftId: string | null;
  currentVersion: number | null;
  title: string;
  summary: string;
  body: string;
  category: string;
  reviewIntervalMonths: number;
  categories: string[];
  reviewed: string | null;
  nextReview: string | null;
  reviewDue: boolean;
  file: { label: string; href: string } | null;
  canDraft: boolean;
  canPublish: boolean;
  canReview: boolean;
  canArchive: boolean;
  canDelete: boolean;
  history: HistoryItem[];
};

function SopSteps({ body }: { body: string }) {
  return <GuideContent blocks={parseMarkdown(body)} source={NO_GUIDE} />;
}

/** One SOP on one page (decision 2026-11-03-sop-library): the document, and its details beside it. */
export function SopEditor(props: Props) {
  const { sopId, draftId, currentVersion, canPublish } = props;
  const [title, setTitle] = useState(props.title);
  const [summary, setSummary] = useState(props.summary);
  const [body, setBody] = useState(props.body);
  const [category, setCategory] = useState(props.category);
  const [interval, setInterval] = useState(String(props.reviewIntervalMonths));
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [dirty, setDirty] = useState(false);
  const steps = useRef<HTMLTextAreaElement>(null);
  const publishDialog = useRef<HTMLDialogElement>(null);
  const [saved, save, saving] = useActionState(saveSopDraftAction, idle);
  const [published, publish, publishing] = useActionState(publishSopAction, idle);
  const [lastSaved, setLastSaved] = useState(saved);

  // React's recommended way to respond to a new result: compare during render.
  if (saved !== lastSaved) {
    setLastSaved(saved);
    if (saved.status === "done") {
      setDirty(false);
    }
  }

  // Leaving with unsaved words asks first.
  useEffect(() => {
    if (!dirty) {
      return;
    }
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const editing = draftId !== null;
  const edit =
    <T,>(set: (value: T) => void) =>
    (value: T) => {
      set(value);
      setDirty(true);
    };
  const applyFormat = (
    change: (text: string, start: number, end: number) => { text: string; cursor: number },
  ) => {
    const area = steps.current;
    const result = change(
      body,
      area?.selectionStart ?? body.length,
      area?.selectionEnd ?? body.length,
    );
    edit(setBody)(result.text);
    // After React has written the new text, put the cursor back where the writer was.
    requestAnimationFrame(() => {
      area?.focus();
      area?.setSelectionRange(result.cursor, result.cursor);
    });
  };
  const hasContent = body.trim() !== "" || props.file !== null;
  const openPublish = () => publishDialog.current?.showModal();
  const statusText =
    saved.status === "error"
      ? saved.message
      : dirty
        ? "Unsaved changes"
        : saved.status === "done"
          ? "All changes saved"
          : "";

  const fields = (
    <>
      <input type="hidden" name="sopId" value={sopId} />
      <input type="hidden" name="versionId" value={draftId ?? ""} />
    </>
  );

  return (
    <div className="flex flex-col">
      <div className="sticky top-14 z-10 -mx-4 -mt-8 mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border bg-surface px-4 py-2.5 md:-mx-8 md:px-8 lg:top-0 lg:-mt-10 xl:-mx-12 xl:px-12">
        <span className="hidden min-w-0 truncate text-small text-text-muted md:inline">
          <Link href="/admin/sops" className="underline-offset-3 hover:underline">
            SOP library
          </Link>{" "}
          / <span className="font-medium text-text-secondary">{title || "Untitled SOP"}</span>
        </span>
        <div className="mr-auto flex min-w-0 flex-wrap items-center gap-1.5">
          {props.archived ? (
            <StatusBadge tone="neutral">Archived</StatusBadge>
          ) : editing ? (
            <StatusBadge tone="pending">
              {currentVersion ? `Draft of version ${currentVersion + 1}` : "Draft"}
            </StatusBadge>
          ) : currentVersion ? (
            <StatusBadge tone={props.reviewDue ? "pending" : "success"}>
              {props.reviewDue ? "Review due" : "Current"} · Version {currentVersion}
            </StatusBadge>
          ) : null}
          {editing ? (
            <span
              role={saved.status === "error" ? "alert" : "status"}
              className={`text-small ${saved.status === "error" ? "text-error" : "text-text-muted"}`}
            >
              {statusText}
            </span>
          ) : null}
        </div>
        {editing ? (
          <div className="flex flex-wrap gap-2">
            <Button type="submit" form="sop-form" variant="secondary" disabled={saving}>
              {saving ? "Saving…" : "Save draft"}
            </Button>
            {canPublish ? <Button onClick={openPublish}>Publish</Button> : null}
          </div>
        ) : props.canDraft && !props.archived ? (
          <ActionForm
            action={startSopDraftAction}
            submitLabel="Edit SOP"
            pendingLabel="Starting a draft…"
            hidden={{ sopId }}
            className="contents"
          />
        ) : null}
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
        {editing ? (
          <form id="sop-form" action={save} className="flex min-w-0 flex-col gap-3.5">
            {fields}
            {currentVersion ? (
              <p className="rounded-button border border-warning-line bg-warning-soft px-3 py-2 text-small">
                Volunteers keep seeing version {currentVersion} until you publish this draft.
              </p>
            ) : null}
            <h1 className="sr-only">{title || "Untitled SOP"}</h1>
            <p className="eyebrow">{props.audience}</p>
            <div>
              <label htmlFor="sop-title" className="sr-only">
                Title
              </label>
              <input
                id="sop-title"
                name="title"
                required
                maxLength={120}
                value={title}
                onChange={(event) => edit(setTitle)(event.target.value)}
                placeholder="SOP title"
                className="w-full border-b border-border bg-transparent pb-1.5 text-title font-semibold hover:border-border-strong"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="sop-summary" className="text-small font-medium text-text-secondary">
                Summary
              </label>
              <input
                id="sop-summary"
                name="summary"
                maxLength={1000}
                value={summary}
                onChange={(event) => edit(setSummary)(event.target.value)}
                placeholder="What this procedure is for and when to use it"
                className={`${fieldClasses} w-full`}
              />
            </div>

            <div className="overflow-hidden rounded-card border border-border bg-surface">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-border bg-card px-2.5 py-2">
                <div
                  role="toolbar"
                  aria-label="Formatting"
                  className="mr-auto flex flex-wrap items-center gap-0.5"
                >
                  {(
                    [
                      ["heading", "Heading"],
                      ["steps", "Steps"],
                      ["bullets", "Bullets"],
                    ] as [SopLineFormat, string][]
                  ).map(([format, label]) => (
                    <ToolButton
                      key={format}
                      label={label}
                      onClick={() =>
                        applyFormat((text, start, end) => formatSopLines(text, start, end, format))
                      }
                    />
                  ))}
                  <ToolButton label="Bold" onClick={() => applyFormat(boldSopText)} />
                  <ToolButton
                    label="Warning"
                    onClick={() =>
                      applyFormat((text, start, end) => formatSopLines(text, start, end, "warning"))
                    }
                  />
                  <span aria-hidden="true" className="mx-1 h-4 w-px bg-border" />
                  <ToolButton
                    label="Use a template"
                    onClick={() =>
                      applyFormat(() => ({ text: SOP_TEMPLATE, cursor: SOP_TEMPLATE.length }))
                    }
                  />
                </div>
                <div
                  role="group"
                  aria-label="Write or preview"
                  className="inline-flex overflow-hidden rounded-button border border-border-strong"
                >
                  {(["write", "preview"] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={tab === value}
                      onClick={() => setTab(value)}
                      className={`min-h-button-sm px-2.5 text-small font-medium capitalize ${
                        tab === value
                          ? "bg-accent-soft font-semibold text-accent-light"
                          : "text-text-secondary"
                      }`}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </div>
              {/* The text stays in the form during Preview, so saving never loses it. */}
              <label htmlFor="sop-body" className="sr-only">
                The procedure
              </label>
              <textarea
                ref={steps}
                id="sop-body"
                name="body"
                maxLength={50000}
                value={body}
                hidden={tab !== "write"}
                onChange={(event) => edit(setBody)(event.target.value)}
                placeholder="Write the steps here, or attach a file instead."
                className="block min-h-72 w-full resize-y bg-transparent px-4 py-3.5 text-body lg:min-h-96"
              />
              {tab === "preview" ? (
                <div className="min-h-72 px-4 py-3.5 lg:min-h-96">
                  {body.trim() ? (
                    <SopSteps body={body} />
                  ) : (
                    <p className="text-text-muted">Nothing written yet.</p>
                  )}
                </div>
              ) : null}
            </div>
          </form>
        ) : (
          <div className="flex min-w-0 flex-col gap-3.5">
            <p className="eyebrow">{props.audience}</p>
            <h1 className="text-title font-semibold text-balance">{title}</h1>
            {summary ? <p className="text-text-secondary">{summary}</p> : null}
            <div className="rounded-card border border-border bg-surface px-4 py-3.5">
              {body.trim() ? (
                <SopSteps body={body} />
              ) : (
                <p className="text-text-muted">
                  {props.file
                    ? "This SOP has no written steps. Its procedure is in the attached file."
                    : "Nothing has been written yet."}
                </p>
              )}
            </div>
          </div>
        )}

        <aside aria-label="SOP details" className="flex min-w-0 flex-col gap-3">
          <DetailsPanel
            {...props}
            editing={editing}
            category={category}
            interval={interval}
            setCategory={edit(setCategory)}
            setInterval={edit(setInterval)}
          />
          <FilePanel sopId={sopId} draftId={draftId} file={props.file} />
          <section aria-labelledby="sop-history" className={panel}>
            <h2 id="sop-history" className="text-button font-semibold">
              Version history
            </h2>
            {props.history.length === 0 && !editing ? (
              <p className="text-small text-text-muted">Nothing published yet.</p>
            ) : (
              <ol className="flex flex-col gap-2 text-small">
                {editing ? (
                  <li>
                    <span className="font-medium">Draft</span>
                    <span className="block text-text-muted">Not published</span>
                  </li>
                ) : null}
                {props.history.map((item) => (
                  <li key={item.id}>
                    <span className="font-medium">
                      Version {item.number}
                      {item.current ? " (current)" : ""}
                    </span>
                    <span className="block whitespace-pre-line text-text-muted">
                      {[item.note, item.publishedAt].filter(Boolean).join(" · ")}
                    </span>
                    {item.fileHref ? (
                      <a
                        href={item.fileHref}
                        target="_blank"
                        rel="noopener"
                        className="text-accent-light underline-offset-3 hover:underline"
                      >
                        Open {item.fileName}
                        <span className="sr-only"> (opens in a new tab)</span>
                      </a>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
          </section>
          {props.canDelete ? (
            <details>
              <summary className="w-fit cursor-pointer px-1 py-0.5 text-small text-text-muted">
                Delete this SOP
              </summary>
              <div className="mt-1.5 flex flex-col gap-2 px-1">
                <p className="text-small text-text-secondary">
                  This deletes every version and file for good, and can&apos;t be undone. The audit
                  log keeps a note of what was deleted.
                </p>
                <ActionForm
                  action={deleteSopAction}
                  submitLabel="Delete forever"
                  pendingLabel="Deleting…"
                  variant="destructive"
                  hidden={{ sopId }}
                />
              </div>
            </details>
          ) : null}
          {props.canArchive ? (
            <details>
              <summary className="w-fit cursor-pointer px-1 py-0.5 text-small text-text-muted">
                Archive this SOP
              </summary>
              <div className="mt-1.5 flex flex-col gap-2 px-1">
                <p className="text-small text-text-secondary">
                  Volunteers stop seeing it, and lessons stop listing it. Its versions and files are
                  kept.
                </p>
                <ActionForm
                  action={archiveSopAction}
                  submitLabel="Archive SOP"
                  pendingLabel="Archiving…"
                  variant="destructive"
                  hidden={{ sopId }}
                />
              </div>
            </details>
          ) : null}
        </aside>
      </div>

      {editing && canPublish ? (
        <dialog
          ref={publishDialog}
          aria-labelledby="publish-heading"
          className="backdrop:bg-black/50 m-auto w-[min(27rem,calc(100vw-2rem))] rounded-card border border-border bg-surface p-5 text-text [box-shadow:var(--shadow-lift)]"
        >
          <form action={publish} className="flex flex-col gap-3">
            {fields}
            <input type="hidden" name="title" value={title} />
            <input type="hidden" name="summary" value={summary} />
            <input type="hidden" name="body" value={body} />
            <input type="hidden" name="category" value={category} />
            <input type="hidden" name="reviewIntervalMonths" value={interval} />
            <h2 id="publish-heading" className="text-subheading font-semibold">
              Publish this SOP
            </h2>
            <p className="text-text-secondary">
              {currentVersion
                ? `It replaces version ${currentVersion}, which is kept in the history. It counts as reviewed today.`
                : "It becomes the current version, and counts as reviewed today."}
            </p>
            {hasContent ? null : (
              <p role="alert" className="text-small font-medium text-warning">
                Write the steps or attach a file before publishing.
              </p>
            )}
            <div className="flex flex-col gap-1">
              <label htmlFor="sop-change-note" className="text-small font-medium">
                What changed?
              </label>
              <input
                id="sop-change-note"
                name="changeNote"
                required
                maxLength={500}
                defaultValue={currentVersion ? "" : "First version"}
                placeholder="For example, Added the new camera presets"
                className={fieldClasses}
              />
            </div>
            {published.status === "error" ? (
              <p role="alert" className="text-small text-error">
                {published.message}
              </p>
            ) : null}
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => publishDialog.current?.close()}
                disabled={publishing}
              >
                Keep editing
              </Button>
              <Button type="submit" disabled={!hasContent || publishing}>
                {publishing ? "Publishing…" : "Publish"}
              </Button>
            </div>
          </form>
        </dialog>
      ) : editing ? (
        <p className="mt-3 text-small text-text-muted">
          Someone with publishing rights for {props.audience} publishes the draft.
        </p>
      ) : null}
    </div>
  );
}

function ToolButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-h-button-sm rounded-[7px] px-2 text-small font-medium text-text-secondary hover:bg-hover hover:text-text"
    >
      {label}
    </button>
  );
}

function DetailsPanel({
  sopId,
  audience,
  ownerName,
  reviewed,
  nextReview,
  categories,
  canDraft,
  canReview,
  archived,
  editing,
  category,
  interval,
  setCategory,
  setInterval,
}: Props & {
  editing: boolean;
  interval: string;
  setCategory: (value: string) => void;
  setInterval: (value: string) => void;
}) {
  const [changed, setChanged] = useState(false);
  const canEdit = canDraft && !archived;
  const change =
    <T,>(set: (value: T) => void) =>
    (value: T) => {
      set(value);
      setChanged(true);
    };
  const fields = (
    <>
      <div className="flex flex-col gap-1">
        <label htmlFor="sop-category" className="text-small font-medium">
          Category
        </label>
        <input
          id="sop-category"
          name="category"
          form={editing ? "sop-form" : undefined}
          list="sop-categories"
          maxLength={60}
          value={category}
          onChange={(event) => change(setCategory)(event.target.value)}
          className={compactField}
        />
        <datalist id="sop-categories">
          {categories.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="sop-interval" className="text-small font-medium">
          Review every
        </label>
        <select
          id="sop-interval"
          name="reviewIntervalMonths"
          form={editing ? "sop-form" : undefined}
          value={interval}
          onChange={(event) => change(setInterval)(event.target.value)}
          className={compactField}
        >
          {REVIEW_INTERVALS.map((months) => (
            <option key={months} value={months}>
              {months} months
            </option>
          ))}
        </select>
      </div>
    </>
  );
  return (
    <section aria-labelledby="sop-details" className={panel}>
      <h2 id="sop-details" className="text-button font-semibold">
        Details
      </h2>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-small">
        <dt className="text-text-muted">For</dt>
        <dd className="wrap-anywhere text-text-secondary">{audience}</dd>
        <dt className="text-text-muted">Owner</dt>
        <dd className="wrap-anywhere text-text-secondary">{ownerName ?? "Not recorded"}</dd>
        <dt className="text-text-muted">Reviewed</dt>
        <dd className="text-text-secondary">{reviewed ?? "When published"}</dd>
        <dt className="text-text-muted">Next review</dt>
        <dd className="text-text-secondary">{nextReview ?? "Not set"}</dd>
      </dl>
      {!canEdit ? null : editing ? (
        // Saved with the draft by the buttons along the top.
        fields
      ) : (
        <ActionForm
          action={updateSopSettingsAction}
          submitLabel="Save details"
          variant="secondary"
          hidden={{ sopId }}
          className="flex flex-col gap-2.5"
        >
          {fields}
        </ActionForm>
      )}
      {canReview ? (
        <ActionForm
          action={markSopReviewedAction}
          submitLabel="Mark as reviewed today"
          pendingLabel="Saving…"
          variant={changed ? "secondary" : "primary"}
          hidden={{ sopId }}
        />
      ) : null}
    </section>
  );
}

function FilePanel({
  sopId,
  draftId,
  file,
}: {
  sopId: string;
  draftId: string | null;
  file: Props["file"];
}) {
  const form = useRef<HTMLFormElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [uploaded, upload, uploading] = useActionState(uploadSopFileAction, idle);
  return (
    <section aria-labelledby="sop-file-heading" className={panel}>
      <h2 id="sop-file-heading" className="text-button font-semibold">
        File <span className="font-normal text-text-muted">(optional)</span>
      </h2>
      {file ? (
        <div className="flex flex-col gap-1.5 text-small">
          <a
            href={file.href}
            target="_blank"
            rel="noopener"
            className="wrap-anywhere text-accent-light underline-offset-3 hover:underline"
          >
            {file.label}
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
          {draftId ? (
            <ActionForm
              action={removeSopFileAction}
              submitLabel="Remove file"
              pendingLabel="Removing…"
              variant="secondary"
              hidden={{ versionId: draftId, sopId }}
            />
          ) : null}
        </div>
      ) : draftId ? null : (
        <p className="text-small text-text-muted">No file attached.</p>
      )}
      {draftId ? (
        <form ref={form} action={upload}>
          <input type="hidden" name="versionId" value={draftId} />
          <label
            htmlFor="sop-file"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              if (input.current && event.dataTransfer.files.length > 0) {
                input.current.files = event.dataTransfer.files;
                form.current?.requestSubmit();
              }
            }}
            className="flex cursor-pointer flex-col items-center gap-0.5 rounded-button border border-dashed border-border-strong px-2.5 py-3 text-center text-small text-text-secondary hover:bg-hover has-focus-visible:outline-2 has-focus-visible:outline-accent-light"
          >
            <span className="sr-only">SOP file: </span>
            <span>
              <span className="font-semibold text-accent-light">
                {uploading ? "Uploading…" : file ? "Replace the file" : "Choose a file"}
              </span>{" "}
              or drop it here
            </span>
            <span>PDF, PNG, or JPEG, up to 10 MB</span>
            <input
              ref={input}
              id="sop-file"
              name="file"
              type="file"
              accept="application/pdf,image/png,image/jpeg"
              disabled={uploading}
              onChange={() => form.current?.requestSubmit()}
              className="sr-only"
            />
          </label>
          {uploaded.status === "idle" ? null : (
            <p
              role={uploaded.status === "error" ? "alert" : "status"}
              className={`mt-1.5 text-small ${uploaded.status === "error" ? "text-error" : "text-text-secondary"}`}
            >
              {uploaded.message}
            </p>
          )}
        </form>
      ) : null}
    </section>
  );
}
