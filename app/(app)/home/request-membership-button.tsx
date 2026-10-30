"use client";

import { useActionState, useId } from "react";
import { Button } from "@/components/ui/button";
import { requestMembershipAction, type RequestMembershipState } from "./actions";

const initialState: RequestMembershipState = { status: "idle" };

export function RequestMembershipButton({
  departmentId,
  departmentName,
  again,
}: {
  departmentId: string;
  departmentName: string;
  again: boolean;
}) {
  const [state, formAction, pending] = useActionState(requestMembershipAction, initialState);
  const errorId = useId();
  const label = again ? "Request again" : "Request to join";

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="departmentId" value={departmentId} />
      <Button
        type="submit"
        disabled={pending}
        aria-describedby={state.status === "error" ? errorId : undefined}
        className="self-start"
      >
        {pending ? "Sending request…" : label}
        <span className="sr-only"> {departmentName}</span>
      </Button>
      {state.status === "error" ? (
        <p id={errorId} role="alert" className="text-small text-error">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
