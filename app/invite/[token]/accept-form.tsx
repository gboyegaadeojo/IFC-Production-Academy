"use client";

import { useActionState, useId } from "react";
import { Button } from "@/components/ui/button";
import { acceptInvitationAction, type AcceptState } from "./actions";

const idle: AcceptState = { status: "idle" };

export function AcceptForm({ token, label }: { token: string; label: string }) {
  const [state, formAction, pending] = useActionState(acceptInvitationAction, idle);
  const errorId = useId();
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="token" value={token} />
      <Button
        type="submit"
        disabled={pending}
        className="w-full"
        aria-describedby={state.status === "error" ? errorId : undefined}
      >
        {pending ? "Joining…" : label}
      </Button>
      {state.status === "error" ? (
        <p id={errorId} role="alert" className="text-small text-error">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
