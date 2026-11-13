"use client";

import { useActionState, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { fieldClasses } from "@/components/ui/field-classes";
import type { DecisionState } from "@/app/copyright/actions";

type Choice = "approve" | "decline" | "review";

const idle: DecisionState = { status: "idle" };

const CHOICE_LABELS: Record<Choice, string> = {
  approve: "Approve",
  decline: "Not approved",
  review: "Copyright review",
};

/**
 * Deciding on a request (ADD-COPY-04..07). Quality control gets three choices, picks where it goes
 * in the order of service, and for a copyright review picks reviewers and writes what to check.
 * Reviewers get two. The checks help a person decide; they never decide for them.
 */
export function DecisionForm({
  action,
  mode,
  requesterFirstName,
  checks,
  reviewers = [],
}: {
  action: (state: DecisionState, formData: FormData) => Promise<DecisionState>;
  mode: "quality_control" | "reviewer";
  requesterFirstName: string;
  checks: string[];
  reviewers?: { kind: "member" | "outside"; id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState(action, idle);
  const [choice, setChoice] = useState<Choice>("approve");
  const ids = { note: useId(), question: useId(), error: useId() };
  const choices: Choice[] =
    mode === "quality_control" ? ["approve", "decline", "review"] : ["approve", "decline"];

  if ("ok" in state && state.ok) {
    return (
      <div role="status" className="rounded-card border border-success-line bg-success-soft p-5">
        <p className="font-semibold">
          {choice === "review"
            ? "Sent for a copyright review. The reviewers have been emailed."
            : `Done. ${requesterFirstName} has been emailed.`}
        </p>
      </div>
    );
  }

  return (
    <form
      action={formAction}
      className="flex flex-col gap-5 rounded-card border border-border bg-surface p-5"
    >
      {checks.length > 0 ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 font-semibold">Checks</legend>
          {checks.map((check) => (
            <label key={check} className="flex items-start gap-3">
              <input type="checkbox" className="mt-1 size-4 accent-[var(--accent)]" />
              <span>{check}</span>
            </label>
          ))}
          <span className="text-small text-text-muted">
            These help you decide. They don&apos;t decide for you.
          </span>
        </fieldset>
      ) : null}

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-semibold">
          {mode === "quality_control" ? "What happens next?" : "Your decision"}
        </legend>
        <div className={`grid gap-2 ${choices.length === 3 ? "sm:grid-cols-3" : "grid-cols-2"}`}>
          {choices.map((option) => (
            <label
              key={option}
              className="flex min-h-touch cursor-pointer items-center justify-center rounded-button border border-border px-3 text-center font-semibold transition-surface hover:border-border-strong has-[:checked]:border-accent has-[:checked]:bg-accent-soft has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent-light"
            >
              <input
                type="radio"
                name="choice"
                value={option}
                checked={choice === option}
                onChange={() => setChoice(option)}
                className="sr-only"
              />
              {CHOICE_LABELS[option]}
            </label>
          ))}
        </div>
      </fieldset>

      {choice === "review" ? (
        <>
          <div className="flex flex-col gap-1.5 rounded-button bg-hover p-4">
            <p className="font-semibold">It goes to every copyright reviewer</p>
            {reviewers.length === 0 ? (
              <p className="text-small text-text-secondary">
                There are no copyright reviewers yet. An admin adds them in Admin → Video and
                graphics approvals.
              </p>
            ) : (
              <p className="text-small text-text-secondary">
                {reviewers.map((reviewer) => reviewer.name).join(", ")}. The first to decide closes
                it.
              </p>
            )}
            {reviewers.map((reviewer) => (
              <input
                key={`${reviewer.kind}:${reviewer.id}`}
                type="hidden"
                name="reviewers"
                value={`${reviewer.kind}:${reviewer.id}`}
              />
            ))}
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={ids.question} className="text-small font-medium text-text-secondary">
              What should they check?
            </label>
            <textarea
              id={ids.question}
              name="question"
              required
              rows={3}
              maxLength={1000}
              className={`${fieldClasses} py-2`}
            />
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={ids.note} className="text-small font-medium text-text-secondary">
            Note to {requesterFirstName} (goes in the email)
          </label>
          <textarea
            id={ids.note}
            name="note"
            rows={3}
            maxLength={2000}
            required={choice === "decline"}
            className={`${fieldClasses} py-2`}
          />
          {choice === "decline" ? (
            <span className="text-small text-text-muted">Say what would help them.</span>
          ) : null}
        </div>
      )}

      {"ok" in state && !state.ok ? (
        <p id={ids.error} role="alert" className="text-small text-error">
          {state.error}
        </p>
      ) : null}
      <Button
        type="submit"
        disabled={pending}
        aria-describedby={"ok" in state && !state.ok ? ids.error : undefined}
      >
        {pending
          ? "Saving…"
          : choice === "review"
            ? "Send for copyright review"
            : choice === "approve"
              ? `Approve and email ${requesterFirstName}`
              : `Decline and email ${requesterFirstName}`}
      </Button>
    </form>
  );
}
