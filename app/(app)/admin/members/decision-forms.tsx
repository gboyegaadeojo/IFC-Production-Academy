"use client";

import { useActionState, useId } from "react";
import { Button } from "@/components/ui/button";
import { decideMembershipAction, type DecisionState } from "./actions";

const initialState: DecisionState = { status: "idle" };

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

/** Approve or decline a request, with an optional note kept in the membership history. */
export function RequestDecisionForm({
  membershipId,
  personName,
}: {
  membershipId: string;
  personName: string;
}) {
  const [state, formAction, pending] = useActionState(decideMembershipAction, initialState);
  const noteId = useId();
  const resultId = useId();

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="membershipId" value={membershipId} />
      <label htmlFor={noteId} className="text-small text-text-secondary">
        Note (optional)
      </label>
      <input
        id={noteId}
        name="reason"
        maxLength={500}
        className="min-h-11 rounded-button border border-border bg-surface px-4 text-body text-text"
      />
      <div className="flex flex-wrap gap-3">
        <Button
          type="submit"
          name="decision"
          value="active"
          disabled={pending}
          aria-describedby={state.status === "idle" ? undefined : resultId}
        >
          Approve<span className="sr-only"> {personName}</span>
        </Button>
        <Button
          type="submit"
          name="decision"
          value="declined"
          variant="secondary"
          disabled={pending}
        >
          Decline<span className="sr-only"> {personName}</span>
        </Button>
      </div>
      <Result state={state} id={resultId} />
    </form>
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
      <summary className="flex min-h-11 cursor-pointer items-center text-small font-medium text-text-secondary hover:text-text">
        Remove<span className="sr-only"> {personName}</span>
      </summary>
      <form action={formAction} className="mt-3 flex flex-col gap-3">
        <input type="hidden" name="membershipId" value={membershipId} />
        <input type="hidden" name="decision" value="removed" />
        <label htmlFor={reasonId} className="text-small text-text-secondary">
          Reason (optional)
        </label>
        <input
          id={reasonId}
          name="reason"
          maxLength={500}
          className="min-h-11 rounded-button border border-border bg-surface px-4 text-body text-text"
        />
        <p className="text-small text-text-muted">
          They lose access to this department&apos;s training. Their progress and history are kept.
        </p>
        <Button
          type="submit"
          variant="destructive"
          disabled={pending}
          className="self-start"
          aria-describedby={state.status === "idle" ? undefined : resultId}
        >
          Remove {personName}
        </Button>
        <Result state={state} id={resultId} />
      </form>
    </details>
  );
}
