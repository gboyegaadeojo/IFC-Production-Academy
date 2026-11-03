"use client";

import { useActionState, useId } from "react";
import { fieldClasses } from "@/components/ui/action-form";
import { Button } from "@/components/ui/button";
import { ChevronDownIcon } from "@/components/ui/icons";
import { decideMembershipAction, type DecisionState } from "./actions";

const initialState: DecisionState = { status: "idle" };

const disclosure =
  "flex min-h-control cursor-pointer list-none items-center rounded-button border border-border-strong px-3 text-small text-text-secondary transition-surface hover:bg-hover hover:text-text [&::-webkit-details-marker]:hidden";

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
 * Review actions for one request (DESIGN §7.2). Approve is the one button on each row; a note and
 * declining sit behind "More", and declining still takes a deliberate second step.
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
  const approveFormId = useId();
  const noteId = useId();
  const reasonId = useId();
  const approveResultId = useId();
  const declineResultId = useId();
  const pending = approving || declining;

  return (
    <div className="flex flex-col gap-2 md:items-end">
      <div className="flex flex-wrap items-start gap-2 md:justify-end">
        <form id={approveFormId} action={approveAction}>
          <input type="hidden" name="membershipId" value={membershipId} />
          <input type="hidden" name="decision" value="active" />
          <Button
            type="submit"
            disabled={pending}
            aria-describedby={approveState.status === "idle" ? undefined : approveResultId}
          >
            {approving ? "Approving…" : "Approve"}
            <span className="sr-only"> {personName}</span>
          </Button>
        </form>
        <details className="group">
          <summary className={disclosure}>
            More
            <span className="sr-only"> options for {personName}</span>
            <ChevronDownIcon className="ml-1 size-3.5 group-open:rotate-180" />
          </summary>
          <div className="mt-2 flex w-72 max-w-full flex-col gap-3 rounded-card border border-border bg-surface p-3">
            <div className="flex flex-col gap-1">
              <label htmlFor={noteId} className="text-small text-text-secondary">
                Note (optional)
              </label>
              {/* Goes with Approve, kept in the history. */}
              <input
                id={noteId}
                form={approveFormId}
                name="reason"
                maxLength={500}
                className={`${fieldClasses} w-full`}
              />
            </div>
            <form
              action={declineAction}
              className="flex flex-col gap-2 border-t border-border pt-3"
            >
              <input type="hidden" name="membershipId" value={membershipId} />
              <input type="hidden" name="decision" value="declined" />
              <label htmlFor={reasonId} className="text-small text-text-secondary">
                Reason for declining (optional, kept in the history)
              </label>
              <input
                id={reasonId}
                name="reason"
                maxLength={500}
                className={`${fieldClasses} w-full`}
              />
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
          </div>
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
        <input id={reasonId} name="reason" maxLength={500} className={`${fieldClasses} w-full`} />
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
