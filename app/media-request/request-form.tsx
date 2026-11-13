"use client";

import Link from "next/link";
import { useActionState, useId, useState } from "react";
import { Button, buttonClasses } from "@/components/ui/button";
import { fieldClasses } from "@/components/ui/field-classes";
import {
  deadlineWording,
  earliestOnTimeDay,
  isAllowedGraphic,
  isLate,
  type DeadlineCounting,
  type LatePolicy,
  type RequestKind,
} from "@/lib/domain/copyright";
import { graphicUploadAction, submitRequestAction, type RequestState } from "./actions";

const idle: RequestState = { status: "idle" };

const dayFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "UTC",
  weekday: "long",
  day: "numeric",
  month: "long",
});

/** "Tuesday, November 17" for a YYYY-MM-DD date. */
function dayLabel(isoDate: string): string {
  return isoDate ? dayFormat.format(new Date(`${isoDate}T12:00:00Z`)) : "";
}

type Upload =
  | { state: "none" }
  | { state: "uploading"; name: string }
  | { state: "done"; name: string; path: string }
  | { state: "error"; message: string };

/** The public request form (ADD-COPY-01, -02). */
export function RequestForm({
  today,
  deadline,
  latePolicy,
}: {
  today: string;
  deadline: { days: number; counting: DeadlineCounting };
  latePolicy: LatePolicy;
}) {
  const [state, action, pending] = useActionState(submitRequestAction, idle);
  const [kind, setKind] = useState<RequestKind>("video");
  const [graphicSource, setGraphicSource] = useState<"upload" | "link">("upload");
  const [otherDate, setOtherDate] = useState("");
  const [upload, setUpload] = useState<Upload>({ state: "none" });
  const ids = {
    first: useId(),
    last: useId(),
    email: useId(),
    link: useId(),
    file: useId(),
    hint: useId(),
    other: useId(),
    description: useId(),
    late: useId(),
    error: useId(),
  };

  const blocking = latePolicy === "block";
  const earliest = today ? earliestOnTimeDay(today, deadline) : "";
  const late = Boolean(otherDate && today && isLate(today, otherDate, deadline));
  const wording = deadlineWording(deadline);

  async function chooseFile(file: File | undefined) {
    if (!file) {
      setUpload({ state: "none" });
      return;
    }
    if (!isAllowedGraphic(file.type, file.size)) {
      setUpload({ state: "error", message: "Upload a PNG, JPEG, WebP or PDF of up to 20 MB." });
      return;
    }
    setUpload({ state: "uploading", name: file.name });
    const slot = await graphicUploadAction({ name: file.name, type: file.type, size: file.size });
    if (!slot.ok) {
      setUpload({ state: "error", message: slot.error });
      return;
    }
    const response = await fetch(slot.url, {
      method: "PUT",
      headers: { "content-type": file.type },
      body: file,
    }).catch(() => null);
    setUpload(
      response?.ok
        ? { state: "done", name: file.name, path: slot.path }
        : { state: "error", message: "That upload didn't finish. Try again, or paste a link." },
    );
  }

  if (state.status === "sent") {
    return (
      <div
        role="status"
        className="flex flex-col items-start gap-3 rounded-card border border-success-line bg-success-soft p-6"
      >
        <h2 className="text-title font-semibold">Thanks, {state.firstName}. We&apos;ve got it.</h2>
        <p className="text-text-secondary">
          Our Quality control team will check it. We&apos;ve emailed you a copy with a link to see
          its progress, and we&apos;ll email you again once it&apos;s decided.
        </p>
        {state.isLate ? (
          <p className="text-small text-text-secondary">
            It&apos;s less than {wording} before the service, so it may not be checked in time.
          </p>
        ) : null}
        {state.reference ? (
          <p className="text-small text-text-muted">Reference {state.reference}</p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {state.statusPath ? (
            <Link href={state.statusPath} className={buttonClasses("primary")}>
              See its progress
            </Link>
          ) : null}
          <a href="/media-request" className={buttonClasses("secondary")}>
            Send another
          </a>
        </div>
      </div>
    );
  }

  const blocked = late && blocking;

  return (
    <form
      action={action}
      className="flex flex-col gap-5 rounded-card border border-border bg-surface p-5 sm:p-6"
      aria-labelledby="request-heading"
    >
      <h2 id="request-heading" className="text-heading font-semibold">
        Your request
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={ids.first} className="text-small font-medium text-text-secondary">
            First name
          </label>
          <input
            id={ids.first}
            name="firstName"
            required
            maxLength={60}
            autoComplete="given-name"
            className={fieldClasses}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={ids.last} className="text-small font-medium text-text-secondary">
            Last name
          </label>
          <input
            id={ids.last}
            name="lastName"
            maxLength={60}
            autoComplete="family-name"
            className={fieldClasses}
          />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={ids.email} className="text-small font-medium text-text-secondary">
          Email
        </label>
        <input
          id={ids.email}
          name="email"
          type="email"
          required
          maxLength={254}
          autoComplete="email"
          className={fieldClasses}
        />
        <span className="text-small text-text-muted">We&apos;ll send the answer here.</span>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-small font-medium text-text-secondary">
          What should we check?
        </legend>
        <div className="grid grid-cols-2 gap-2">
          {(["video", "graphic"] as const).map((option) => (
            <label
              key={option}
              className="flex min-h-touch cursor-pointer items-center justify-center rounded-button border border-border bg-surface px-3 font-semibold transition-surface hover:border-border-strong has-[:checked]:border-accent has-[:checked]:bg-accent-soft has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent-light"
            >
              <input
                type="radio"
                name="kind"
                value={option}
                checked={kind === option}
                onChange={() => setKind(option)}
                className="sr-only"
              />
              {option === "video" ? "A video" : "A graphic"}
            </label>
          ))}
        </div>
      </fieldset>

      {kind === "graphic" ? (
        <div className="flex flex-col gap-2">
          <div role="group" aria-label="How to send the graphic" className="flex gap-4 text-small">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="graphicSource"
                checked={graphicSource === "upload"}
                onChange={() => setGraphicSource("upload")}
              />
              Upload it
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="graphicSource"
                checked={graphicSource === "link"}
                onChange={() => setGraphicSource("link")}
              />
              Paste a link
            </label>
          </div>
          {graphicSource === "upload" ? (
            <div className="flex flex-col gap-1.5">
              <label htmlFor={ids.file} className="text-small font-medium text-text-secondary">
                The graphic (PNG, JPEG, WebP or PDF, up to 20 MB)
              </label>
              <input
                id={ids.file}
                type="file"
                accept="image/png,image/jpeg,image/webp,application/pdf"
                onChange={(event) => void chooseFile(event.target.files?.[0])}
                className="text-small"
              />
              <input
                type="hidden"
                name="filePath"
                value={upload.state === "done" ? upload.path : ""}
              />
              <p role="status" className="text-small text-text-muted">
                {upload.state === "uploading"
                  ? `Uploading ${upload.name}…`
                  : upload.state === "done"
                    ? `${upload.name} is uploaded.`
                    : ""}
              </p>
              {upload.state === "error" ? (
                <p role="alert" className="text-small text-error">
                  {upload.message}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {kind === "video" || graphicSource === "link" ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={ids.link} className="text-small font-medium text-text-secondary">
            {kind === "video" ? "Link to the video" : "Link to the graphic"}
          </label>
          <input
            id={ids.link}
            name="mediaUrl"
            type="url"
            required
            maxLength={500}
            placeholder="https://"
            className={fieldClasses}
          />
          <span className="text-small text-text-muted">
            YouTube, Vimeo or Google Drive. Make sure anyone with the link can view it.
          </span>
        </div>
      ) : (
        <input type="hidden" name="mediaUrl" value="" />
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor={ids.other} className="text-small font-medium text-text-secondary">
          When should it be shown?
        </label>
        <input
          id={ids.other}
          name="otherDate"
          type="date"
          required
          min={(blocking ? earliest : today) || undefined}
          value={otherDate}
          onChange={(event) => setOtherDate(event.target.value)}
          aria-describedby={late ? ids.late : ids.hint}
          className={`${fieldClasses} max-w-xs`}
        />
        <span id={ids.hint} className="text-small text-text-muted">
          {blocking && earliest
            ? `Requests need at least ${wording}' notice, so the earliest date is ${dayLabel(earliest)}.`
            : `Requests need at least ${wording}' notice.`}
        </span>
      </div>
      {late ? (
        <p
          id={ids.late}
          role="alert"
          className={`rounded-button border px-4 py-3 text-small ${
            blocked ? "border-error bg-surface" : "border-warning-line bg-warning-soft"
          }`}
        >
          {blocked ? (
            <>
              <strong>
                That&apos;s less than {wording} away, so we can&apos;t check it in time.
              </strong>{" "}
              Choose {dayLabel(earliest)} or later, or ask the production team directly.
            </>
          ) : (
            <>
              <strong>That&apos;s less than {wording} away.</strong> You can still send it, but it
              may not be checked in time.
            </>
          )}
        </p>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <label htmlFor={ids.description} className="text-small font-medium text-text-secondary">
          What&apos;s it for?
        </label>
        <textarea
          id={ids.description}
          name="description"
          required
          rows={3}
          maxLength={1000}
          placeholder="For example: a missions update before the offering"
          className={`${fieldClasses} py-2`}
        />
      </div>

      {/* Hidden from people and screen readers; only bots fill it in. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      {state.status === "error" ? (
        <p id={ids.error} role="alert" className="text-small text-error">
          {state.message}
        </p>
      ) : null}
      <Button
        type="submit"
        disabled={pending || blocked || upload.state === "uploading"}
        aria-describedby={state.status === "error" ? ids.error : undefined}
      >
        {pending ? "Sending…" : "Send request"}
      </Button>
    </form>
  );
}
