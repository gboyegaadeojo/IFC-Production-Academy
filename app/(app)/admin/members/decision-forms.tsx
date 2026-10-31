"use client";

import { useActionState, useId } from "react";
import { Button } from "@/components/ui/button";
import { decideMembershipAction, type DecisionState } from "./actions";

const initialState: DecisionState = { status: "idle" };

const fieldClasses =
  "min-h-control w-full rounded-button border border-border-strong bg-surface px-3 text-body text-text placeholder:text-text-muted";
const disclosure =
  "flex min-h-control cursor-pointer list-none items-center rounded-button px-2 text-small text-text-secondary transition-surface hover:bg-hover hover:text-text [&::-webkit-details-marker]:hidden";

function Result({ state, id }: { state: DecisionState; id: string }) {
  if (state.status === "idle") {
    return null;
  }
  return (
    <p
      id={id}
      role={state.status === "error" ? "alert" : "status"}
      className={`text-small ${state.status === "error" ? "text-error" : "text-text-secondary"}`}
    >
      {state.message}
    </p>
  );
}

/**
 * Review actions for one request (DESIGN §7.2). Approve is one step; an optional note sits behind
 * "Add a note" instead of a box on every row. Declining needs a deliberate second step.
 * The note is kept in the membership history (SRS-MEM-003).
 */
export function RequestDecisionForm({
  membershipId,
  personName,
}: {
  membershipId: string;
  personName: string;
}) {
  const [approveState, approveAction, approving] = useActionState(
    decideMembershipAction,
    initialState,
  );
  const [declineState, declineAction, declining] = useActionState(
    decideMembershipAction,
    initialState,
  );
  const noteId = useId();
  const reasonId = useId();
  const approveResultId = useId();
  const declineResultId = useId();
  const pending = approving || declining;

  return (
    <div className="flex flex-col gap-2 md:items-end">
      <div className="flex flex-wrap items-start gap-2 md:justify-end">
        <form action={approveAction} className="flex flex-col gap-2">
          <input type="hidden" name="membershipId" value={membershipId} />
          <input type="hidden" name="decision" value="active" />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="submit"
              disabled={pending}
              aria-describedby={approveState.status === "idle" ? undefined : approveResultId}
            >
              {approving ? "Approving…" : "Approve"}
              <span className="sr-only"> {personName}</span>
            </Button>
            <details className="group">
              <summary className={disclosure}>
                Add a note<span className="sr-only"> for {personName}</span>
              </summary>
              <div className="mt-2 w-64 max-w-full">
                <label htmlFor={noteId} className="mb-1 block text-small text-text-secondary">
                  Note (optional)
                </label>
                <input id={noteId} name="reason" maxLength={500} className={fieldClasses} />
              </div>
            </details>
          </div>
        </form>
        <details className="group">
          <summary className={`${disclosure} border border-border-strong`}>
            Decline…<span className="sr-only"> {personName}</span>
          </summary>
          <form
            action={declineAction}
            className="mt-2 flex w-72 max-w-full flex-col gap-2 rounded-card border border-border bg-surface p-3"
          >
            <input type="hidden" name="membershipId" value={membershipId} />
            <input type="hidden" name="decision" value="declined" />
            <label htmlFor={reasonId} className="text-small text-text-secondary">
              Reason (optional, kept in the history)
            </label>
            <input id={reasonId} name="reason" maxLength={500} className={fieldClasses} />
            <Button
              type="submit"
              variant="destructive"
              disabled={pending}
              aria-describedby={declineState.status === "idle" ? undefined : declineResultId}
            >
              {declining ? "Declining…" : "Decline request"}
              <span className="sr-only"> from {personName}</span>
            </Button>
            <Result state={declineState} id={declineResultId} />
          </form>
        </details>
      </div>
      <Result state={approveState} id={approveResultId} />
    </div>
  );
}

/** Removing a member is behind a disclosure so it can't happen with one stray tap. */
export function RemoveMemberForm({
  membershipId,
  personName,
}: {
  membershipId: string;
  personName: string;
}) {
  const [state, formAction, pending] = useActionState(decideMembershipAction, initialState);
  const reasonId = useId();
  const resultId = useId();

  return (
    <details className="group">
      <summary className={disclosure}>
        Remove…<span className="sr-only"> {personName}</span>
      </summary>
      <form
        action={formAction}
        className="mt-2 flex w-72 max-w-full flex-col gap-2 rounded-card border border-border bg-surface p-3"
      >
        <input type="hidden" name="membershipId" value={membershipId} />
        <input type="hidden" name="decision" value="removed" />
        <label htmlFor={reasonId} className="text-small text-text-secondary">
          Reason (optional)
        </label>
        <input id={reasonId} name="reason" maxLength={500} className={fieldClasses} />
        <p className="text-small text-text-muted">
          They lose access to this department&apos;s training. Their progress and history are kept.
        </p>
        <Button
          type="submit"
          variant="destructive"
          disabled={pending}
          aria-describedby={state.status === "idle" ? undefined : resultId}
        >
          Remove {personName}
        </Button>
        <Result state={state} id={resultId} />
      </form>
    </details>
  );
}
