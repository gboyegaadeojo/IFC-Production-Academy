"use client";

import { useActionState, useId } from "react";
import { Button } from "@/components/ui/button";
import { revokeInvitationAction, type RevokeState } from "./actions";

const idle: RevokeState = { status: "idle" };

export function RevokeInvitationForm({
  invitationId,
  label,
}: {
  invitationId: string;
  label: string;
}) {
  const [state, formAction, pending] = useActionState(revokeInvitationAction, idle);
  const errorId = useId();
  return (
    <details>
      <summary className="flex min-h-11 cursor-pointer items-center text-small font-medium text-text-secondary hover:text-text">
        Revoke<span className="sr-only"> {label}</span>
      </summary>
      <form action={formAction} className="mt-2 flex flex-col gap-2">
        <input type="hidden" name="invitationId" value={invitationId} />
        <p className="text-small text-text-muted">
          The link stops working. People who already joined stay members.
        </p>
        <Button
          type="submit"
          variant="destructive"
          disabled={pending}
          className="self-start"
          aria-describedby={state.status === "error" ? errorId : undefined}
        >
          Revoke invitation
        </Button>
        {state.status === "error" ? (
          <p id={errorId} role="alert" className="text-small text-error">
            {state.message}
          </p>
        ) : null}
      </form>
    </details>
  );
}
