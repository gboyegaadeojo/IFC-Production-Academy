"use client";

import type { CSSProperties, ReactNode } from "react";
import { useActionState, useId, useState } from "react";
import { DepartmentIcon } from "@/components/department-icon";
import { QrCode } from "@/components/qr-code";
import { Button } from "@/components/ui/button";
import { UserIcon } from "@/components/ui/icons";
import { formatDateTime } from "@/lib/domain/admin";
import { formatDate } from "@/lib/domain/dates";
import { departmentHueVar } from "@/lib/domain/departments";
import { MAX_GROUP_SIZE, VALID_DAY_OPTIONS } from "@/lib/domain/invitations";
import { createInvitationAction, type CreateInvitationState } from "./actions";

const idle: CreateInvitationState = { status: "idle" };

const fieldClasses =
  "min-h-control rounded-button border border-border-strong bg-surface px-3 text-body text-text";

/** A choice on real radio buttons, so arrow keys and screen readers work; styled when checked. */
const CHOICE =
  "flex cursor-pointer items-center gap-2 rounded-button border border-border bg-surface transition-surface hover:border-border-strong has-[:checked]:border-accent has-[:checked]:bg-accent-soft has-[:checked]:font-medium has-[:checked]:shadow-[inset_0_0_0_1px_var(--accent)] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent-light";

export type DepartmentChoice = { id: string; name: string; hue: string; icon: string };

export function CreateInvitationForm(props: {
  departments: DepartmentChoice[];
  allowAcademyOnly: boolean;
  inviterName: string;
}) {
  // Changing the key clears the form and the shown link for "Create another".
  const [attempt, setAttempt] = useState(0);
  return <Form key={attempt} {...props} onReset={() => setAttempt((n) => n + 1)} />;
}

function Step({ n, label, children }: { n: number; label: ReactNode; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[1.625rem_minmax(0,1fr)] gap-x-3 gap-y-2.5">
      <span
        aria-hidden="true"
        className="flex size-[1.625rem] items-center justify-center rounded-pill bg-accent-soft text-small font-semibold text-accent-light"
      >
        {n}
      </span>
      <div className="self-center font-semibold">{label}</div>
      <div className="col-start-2 flex min-w-0 flex-col gap-2">{children}</div>
    </div>
  );
}

/**
 * New invitation (approved mock, 2026-11-01): four short steps beside a preview of what the person
 * will see. The fields and their rules are unchanged; the server validates everything again.
 */
function Form({
  departments,
  allowAcademyOnly,
  inviterName,
  onReset,
}: {
  departments: DepartmentChoice[];
  allowAcademyOnly: boolean;
  inviterName: string;
  onReset: () => void;
}) {
  const [state, formAction, pending] = useActionState(createInvitationAction, idle);
  const [departmentId, setDepartmentId] = useState(departments[0]?.id ?? "");
  const [audience, setAudience] = useState<"one" | "group">("one");
  const [days, setDays] = useState<number>(14);
  const ids = {
    department: useId(),
    audience: useId(),
    days: useId(),
    size: useId(),
    note: useId(),
    noteHint: useId(),
    error: useId(),
  };
  const department = departments.find((d) => d.id === departmentId) ?? null;
  // The preview's expiry date, counted from when the form opened.
  const [openedAt] = useState(() => Date.now());
  const until = formatDate(new Date(openedAt + days * 86_400_000).toISOString());

  if (state.status === "created") {
    return <CreatedInvitation state={state} onReset={onReset} />;
  }

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
      <form
        action={formAction}
        aria-labelledby="create-heading"
        className="flex flex-col gap-6 rounded-card border border-border bg-surface p-5 sm:p-6"
      >
        <h2 id="create-heading" className="text-heading font-semibold">
          New invitation
        </h2>

        <Step n={1} label={<span id={ids.department}>Invite to</span>}>
          <div role="radiogroup" aria-labelledby={ids.department} className="flex flex-wrap gap-2">
            {departments.map((choice) => (
              <label
                key={choice.id}
                style={{ "--dept": departmentHueVar(choice.hue) } as CSSProperties}
                className={`${CHOICE} py-1.5 pr-3 pl-1.5 text-small`}
              >
                <input
                  type="radio"
                  name="departmentId"
                  value={choice.id}
                  checked={departmentId === choice.id}
                  onChange={() => setDepartmentId(choice.id)}
                  className="sr-only"
                />
                <span
                  aria-hidden="true"
                  className="flex size-6 items-center justify-center rounded-[6px] bg-hover text-[var(--dept)]"
                >
                  <DepartmentIcon icon={choice.icon} className="size-3.5" />
                </span>
                {choice.name}
              </label>
            ))}
            {allowAcademyOnly ? (
              <label className={`${CHOICE} px-3 py-1.5 text-small`}>
                <input
                  type="radio"
                  name="departmentId"
                  value=""
                  checked={departmentId === ""}
                  onChange={() => setDepartmentId("")}
                  className="sr-only"
                />
                The Academy only, no department
              </label>
            ) : null}
          </div>
        </Step>

        <Step n={2} label={<span id={ids.audience}>Who it&apos;s for</span>}>
          <div
            role="radiogroup"
            aria-labelledby={ids.audience}
            className="grid gap-2.5 sm:grid-cols-2"
          >
            {(
              [
                { value: "one", label: "One person", hint: "A private link you send them" },
                {
                  value: "group",
                  label: "A group",
                  hint: "A QR code to show at a volunteer night",
                },
              ] as const
            ).map((option) => (
              <label key={option.value} className={`${CHOICE} items-start px-3.5 py-3`}>
                <input
                  type="radio"
                  name="audience"
                  value={option.value}
                  checked={audience === option.value}
                  onChange={() => setAudience(option.value)}
                  className="sr-only"
                />
                <span className="flex flex-col">
                  <span className="font-semibold">{option.label}</span>
                  <span className="text-small font-normal text-text-secondary">{option.hint}</span>
                </span>
              </label>
            ))}
          </div>
          {audience === "group" ? (
            <div className="flex flex-col gap-1.5">
              <label htmlFor={ids.size} className="text-small text-text-secondary">
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
        </Step>

        <Step n={3} label={<span id={ids.days}>Link works for</span>}>
          <div
            role="radiogroup"
            aria-labelledby={ids.days}
            className="flex w-fit gap-0.5 rounded-button border border-border bg-card p-[3px]"
          >
            {VALID_DAY_OPTIONS.map((option) => (
              <label
                key={option}
                className="flex min-h-9 cursor-pointer items-center rounded-[7px] px-3.5 text-small text-text-secondary transition-surface hover:text-text has-[:checked]:bg-surface has-[:checked]:font-semibold has-[:checked]:text-text has-[:checked]:shadow-[0_0_0_1px_var(--border)] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent-light"
              >
                <input
                  type="radio"
                  name="validDays"
                  value={option}
                  checked={days === option}
                  onChange={() => setDays(option)}
                  className="sr-only"
                />
                {option} days
              </label>
            ))}
          </div>
        </Step>

        <Step
          n={4}
          label={
            <label htmlFor={ids.note}>
              Note for you <span className="font-normal text-text-muted">(optional)</span>
            </label>
          }
        >
          <input
            id={ids.note}
            name="note"
            maxLength={120}
            placeholder="Volunteer night, 12 November"
            aria-describedby={ids.noteHint}
            className={fieldClasses}
          />
          <p id={ids.noteHint} className="text-small text-text-muted">
            Only leaders see this. Leave out personal details.
          </p>
        </Step>

        {state.status === "error" ? (
          <p id={ids.error} role="alert" className="pl-[2.375rem] text-small text-error">
            {state.message}
          </p>
        ) : null}
        <div className="pl-[2.375rem]">
          <Button
            type="submit"
            disabled={pending}
            aria-describedby={state.status === "error" ? ids.error : undefined}
          >
            {pending ? "Creating…" : "Create invitation link"}
          </Button>
        </div>
      </form>

      <aside
        aria-labelledby="preview-heading"
        className="flex flex-col gap-3 rounded-card border border-border bg-surface p-5 lg:sticky lg:top-6"
      >
        <h2 id="preview-heading" className="eyebrow">
          What they&apos;ll see
        </h2>
        <div
          style={{ "--dept": departmentHueVar(department?.hue ?? "") } as CSSProperties}
          className="flex flex-col gap-3 rounded-[18px] border border-border bg-card p-5"
        >
          <span
            aria-hidden="true"
            className="flex size-10 items-center justify-center rounded-button bg-hover text-[var(--dept)]"
          >
            {department ? (
              <DepartmentIcon icon={department.icon} className="size-5" />
            ) : (
              <UserIcon className="size-5" />
            )}
          </span>
          <p className="text-heading font-semibold">
            You&apos;re invited to {department ? department.name : "the Production Academy"}
          </p>
          <p className="text-small text-text-secondary">
            {inviterName} invited you to the production team&apos;s training at Immanuel Fellowship
            Church.
          </p>
          <span className="inline-flex min-h-control w-fit items-center rounded-button bg-accent px-4 text-small font-medium text-on-accent">
            Accept and sign in
          </span>
          <p className="text-small text-text-muted">This link works until {until}.</p>
        </div>
        <p className="text-small text-text-muted">
          Joining gives them the training. Approval to serve still comes after the hands-on checks.
        </p>
      </aside>
    </div>
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
    <div
      role="status"
      className="flex max-w-3xl flex-col gap-5 rounded-card border border-success-line bg-success-soft p-5 sm:p-6"
    >
      <h3 className="text-heading font-semibold">Your invitation link is ready</h3>
      <p className="text-text-secondary">
        Copy it now: for security we only show it once.{" "}
        {state.maxUses === 1
          ? "It works for one person"
          : `Up to ${state.maxUses} people can use it`}{" "}
        until {formatDateTime(state.expiresAt)}.
      </p>
      <div className="grid items-start gap-5 sm:grid-cols-[minmax(0,1fr)_auto]">
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
          <p className="max-w-48 text-small text-text-muted">
            Show this on a screen or print it. Phones open the same link.
          </p>
        </div>
      </div>
      <Button type="button" variant="tertiary" className="self-start px-0" onClick={onReset}>
        Create another invitation
      </Button>
    </div>
  );
}
