"use client";

import { useActionState, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { updateDisplayNameAction, type ProfileFormState } from "./actions";

const idle: ProfileFormState = { status: "idle" };

/**
 * Your name, edited in place (SRS-AUTH-006; approved mock, 2026-11-01). When you sign in with
 * Planning Center, its name for you is offered as a suggestion; you choose what leaders see.
 */
export function DisplayNameForm({
  displayName,
  planningCenterName,
}: {
  displayName: string;
  planningCenterName: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [state, formAction, pending] = useActionState(
    async (previous: ProfileFormState, formData: FormData) => {
      const next = await updateDisplayNameAction(previous, formData);
      if (next.status === "done") {
        setEditing(false);
      }
      return next;
    },
    idle,
  );
  const fieldId = useId();
  const hintId = useId();
  const resultId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const suggest = planningCenterName !== null && planningCenterName !== displayName;

  const result =
    state.status === "idle" ? null : (
      <p
        id={resultId}
        role={state.status === "error" ? "alert" : "status"}
        className={`text-small ${state.status === "error" ? "text-error" : "text-text-secondary"}`}
      >
        {state.message}
      </p>
    );

  if (!editing) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-small text-text-secondary">Leaders and trainers see this name.</p>
          <Button
            ref={editButtonRef}
            variant="secondary"
            onClick={() => {
              setEditing(true);
              requestAnimationFrame(() => inputRef.current?.focus());
            }}
          >
            Edit name
          </Button>
        </div>
        {state.status === "done" ? result : null}
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <label htmlFor={fieldId} className="text-small font-medium text-text-secondary">
        Your name
      </label>
      <div className="flex flex-wrap gap-2">
        <input
          ref={inputRef}
          id={fieldId}
          name="displayName"
          required
          maxLength={120}
          autoComplete="name"
          defaultValue={displayName}
          aria-describedby={state.status === "error" ? `${hintId} ${resultId}` : hintId}
          aria-invalid={state.status === "error"}
          className="min-h-control min-w-0 flex-1 basis-40 rounded-button border border-border-strong bg-card px-3 text-body text-text aria-invalid:border-error"
        />
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
          {pending ? null : <span className="sr-only"> name</span>}
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            setEditing(false);
            requestAnimationFrame(() => editButtonRef.current?.focus());
          }}
        >
          Cancel
        </Button>
      </div>
      <p id={hintId} className="text-small text-text-muted">
        {suggest ? (
          <>
            Your Planning Center name is &ldquo;{planningCenterName}&rdquo;.{" "}
            <button
              type="button"
              className="rounded-button text-accent-light underline underline-offset-4"
              onClick={() => {
                if (inputRef.current) {
                  inputRef.current.value = planningCenterName;
                  inputRef.current.focus();
                }
              }}
            >
              Use that
            </button>
            , or how you&apos;d like leaders to see you.
          </>
        ) : (
          "Leaders and trainers see this name."
        )}
      </p>
      {state.status === "error" ? result : null}
    </form>
  );
}
