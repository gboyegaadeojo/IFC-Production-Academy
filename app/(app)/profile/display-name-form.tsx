"use client";

import { useActionState, useId } from "react";
import { Button } from "@/components/ui/button";
import { updateDisplayNameAction, type ProfileFormState } from "./actions";

const idle: ProfileFormState = { status: "idle" };

export function DisplayNameForm({ displayName }: { displayName: string }) {
  const [state, formAction, pending] = useActionState(updateDisplayNameAction, idle);
  const fieldId = useId();
  const hintId = useId();
  const resultId = useId();

  return (
    <form action={formAction} className="flex max-w-md flex-col gap-3">
      <label htmlFor={fieldId} className="text-small font-medium text-text-secondary">
        Your name
      </label>
      <p id={hintId} className="text-small text-text-muted">
        Leaders and trainers see this name.
      </p>
      <input
        id={fieldId}
        name="displayName"
        required
        maxLength={120}
        autoComplete="name"
        defaultValue={displayName}
        aria-describedby={state.status === "idle" ? hintId : `${hintId} ${resultId}`}
        aria-invalid={state.status === "error"}
        className="min-h-11 rounded-button border border-border bg-surface px-4 text-body text-text aria-invalid:border-error"
      />
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save name"}
        </Button>
        {state.status === "idle" ? null : (
          <p
            id={resultId}
            role={state.status === "error" ? "alert" : "status"}
            className={`text-small ${state.status === "error" ? "text-error" : "text-text-secondary"}`}
          >
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}
