"use client";

import { useActionState, useId } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { revokeInvitationAction, type RevokeState } from "./actions";

const idle: RevokeState = { status: "idle" };

/** Revoke, after a confirmation: the link stops working; people who already joined stay. */
export function RevokeInvitationForm({
  invitationId,
  label,
}: {
  invitationId: string;
  label: string;
}) {
  return (
    <ConfirmDialog
      triggerLabel="Revoke"
      srLabel={label}
      variant="secondary"
      title="Revoke this invitation?"
      message="The link stops working straight away. People who already joined stay members."
    >
      <RevokeForm invitationId={invitationId} />
    </ConfirmDialog>
  );
}

function RevokeForm({ invitationId }: { invitationId: string }) {
  const [state, formAction, pending] = useActionState(revokeInvitationAction, idle);
  const errorId = useId();
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="invitationId" value={invitationId} />
      <Button
        type="submit"
        variant="destructive"
        disabled={pending}
        aria-describedby={state.status === "error" ? errorId : undefined}
      >
        {pending ? "Revoking…" : "Revoke invitation"}
      </Button>
      {state.status === "error" ? (
        <p id={errorId} role="alert" className="text-small text-error">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
