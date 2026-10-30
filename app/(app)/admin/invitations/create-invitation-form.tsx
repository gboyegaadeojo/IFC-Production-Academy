"use client";

import { useActionState, useId, useState } from "react";
import { QrCode } from "@/components/qr-code";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/domain/admin";
import { MAX_GROUP_SIZE, VALID_DAY_OPTIONS } from "@/lib/domain/invitations";
import { createInvitationAction, type CreateInvitationState } from "./actions";

const idle: CreateInvitationState = { status: "idle" };

const fieldClasses =
  "min-h-11 rounded-button border border-border bg-surface px-4 text-body text-text";

export type DepartmentChoice = { id: string; name: string };

export function CreateInvitationForm(props: {
  departments: DepartmentChoice[];
  allowAcademyOnly: boolean;
}) {
  // Changing the key clears the form and the shown link for "Create another".
  const [attempt, setAttempt] = useState(0);
  return <Form key={attempt} {...props} onReset={() => setAttempt((n) => n + 1)} />;
}

function Form({
  departments,
  allowAcademyOnly,
  onReset,
}: {
  departments: DepartmentChoice[];
  allowAcademyOnly: boolean;
  onReset: () => void;
}) {
  const [state, formAction, pending] = useActionState(createInvitationAction, idle);
  const [audience, setAudience] = useState<"one" | "group">("one");
  const ids = {
    department: useId(),
    size: useId(),
    days: useId(),
    note: useId(),
    noteHint: useId(),
    error: useId(),
  };

  if (state.status === "created") {
    return <CreatedInvitation state={state} onReset={onReset} />;
  }

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <label htmlFor={ids.department} className="text-small font-medium text-text-secondary">
          Invite to
        </label>
        <select id={ids.department} name="departmentId" required className={fieldClasses}>
          {departments.map((department) => (
            <option key={department.id} value={department.id}>
              {department.name}
            </option>
          ))}
          {allowAcademyOnly ? <option value="">The Academy only, no department</option> : null}
        </select>
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-small font-medium text-text-secondary">Who is it for?</legend>
        <label className="flex min-h-11 items-center gap-3">
          <input
            type="radio"
            name="audience"
            value="one"
            checked={audience === "one"}
            onChange={() => setAudience("one")}
            className="size-5 accent-[var(--accent)]"
          />
          One person: send them the link
        </label>
        <label className="flex min-h-11 items-center gap-3">
          <input
            type="radio"
            name="audience"
            value="group"
            checked={audience === "group"}
            onChange={() => setAudience("group")}
            className="size-5 accent-[var(--accent)]"
          />
          A group, such as a QR code at a volunteer night
        </label>
        {audience === "group" ? (
          <div className="flex flex-col gap-2 pl-8">
            <label htmlFor={ids.size} className="text-small font-medium text-text-secondary">
              How many people can use it
            </label>
            <input
              id={ids.size}
              name="groupSize"
              type="number"
              inputMode="numeric"
              min={2}
              max={MAX_GROUP_SIZE}
              defaultValue={25}
              required
              className={`${fieldClasses} w-32`}
            />
          </div>
        ) : null}
      </fieldset>

      <div className="flex flex-col gap-2">
        <label htmlFor={ids.days} className="text-small font-medium text-text-secondary">
          Link works for
        </label>
        <select id={ids.days} name="validDays" defaultValue="14" className={`${fieldClasses} w-48`}>
          {VALID_DAY_OPTIONS.map((days) => (
            <option key={days} value={days}>
              {days} days
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor={ids.note} className="text-small font-medium text-text-secondary">
          Note for you (optional)
        </label>
        <p id={ids.noteHint} className="text-small text-text-muted">
          Something like &ldquo;Volunteer night, 12 November&rdquo;. Leave out personal details.
        </p>
        <input
          id={ids.note}
          name="note"
          maxLength={120}
          aria-describedby={ids.noteHint}
          className={fieldClasses}
        />
      </div>

      {state.status === "error" ? (
        <p id={ids.error} role="alert" className="text-small text-error">
          {state.message}
        </p>
      ) : null}
      <Button
        type="submit"
        disabled={pending}
        className="self-start"
        aria-describedby={state.status === "error" ? ids.error : undefined}
      >
        {pending ? "Creating…" : "Create invitation link"}
      </Button>
    </form>
  );
}

function CreatedInvitation({
  state,
  onReset,
}: {
  state: Extract<CreateInvitationState, { status: "created" }>;
  onReset: () => void;
}) {
  const [copied, setCopied] = useState<"idle" | "copied" | "failed">("idle");
  const linkId = useId();

  async function copy() {
    try {
      await navigator.clipboard.writeText(state.url);
      setCopied("copied");
    } catch {
      setCopied("failed");
    }
  }

  return (
    <div role="status" className="flex flex-col gap-5">
      <h3 className="text-subheading font-semibold">Your invitation link is ready</h3>
      <p className="text-text-secondary">
        Copy it now: for security we only show it once.{" "}
        {state.maxUses === 1
          ? "It works for one person"
          : `Up to ${state.maxUses} people can use it`}{" "}
        until {formatDateTime(state.expiresAt)}.
      </p>
      <div className="flex flex-col gap-2">
        <label htmlFor={linkId} className="text-small font-medium text-text-secondary">
          Invitation link
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id={linkId}
            readOnly
            value={state.url}
            onFocus={(event) => event.currentTarget.select()}
            className={`${fieldClasses} flex-1 font-mono text-small`}
          />
          <Button type="button" variant="secondary" onClick={copy}>
            Copy link
          </Button>
        </div>
        <p aria-live="polite" className="text-small text-text-secondary">
          {copied === "copied"
            ? "Copied."
            : copied === "failed"
              ? "Your browser blocked copying. Select the link and copy it yourself."
              : ""}
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <QrCode value={state.url} label="QR code for the invitation link" />
        <p className="text-small text-text-muted">
          Show this on a screen or print it. Phones open the same link.
        </p>
      </div>
      <Button type="button" variant="tertiary" className="self-start px-0" onClick={onReset}>
        Create another invitation
      </Button>
    </div>
  );
}
