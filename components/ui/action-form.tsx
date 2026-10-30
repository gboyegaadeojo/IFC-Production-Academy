"use client";

import { useActionState, useId, type ReactNode } from "react";
import { Button, type ButtonVariant } from "@/components/ui/button";

export type FormState =
  { status: "idle" } | { status: "done"; message: string } | { status: "error"; message: string };

export type FormAction = (previous: FormState, formData: FormData) => Promise<FormState>;

const idle: FormState = { status: "idle" };

/**
 * A form posting to a server action, with a pending label and an announced result.
 * Fields are passed as children (uncontrolled, with default values).
 */
export function ActionForm({
  action,
  submitLabel,
  pendingLabel = "Saving…",
  variant = "primary",
  hidden,
  children,
  className = "flex flex-col gap-4",
  srLabel,
}: {
  action: FormAction;
  submitLabel: string;
  pendingLabel?: string;
  variant?: ButtonVariant;
  hidden?: Record<string, string>;
  children?: ReactNode;
  className?: string;
  /** Extra words for screen readers, such as which item the button acts on. */
  srLabel?: string;
}) {
  const [state, formAction, pending] = useActionState(action, idle);
  const resultId = useId();
  return (
    <form action={formAction} className={className}>
      {Object.entries(hidden ?? {}).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {children}
      <div className="flex flex-wrap items-center gap-4">
        <Button
          type="submit"
          variant={variant}
          disabled={pending}
          aria-describedby={state.status === "idle" ? undefined : resultId}
        >
          {pending ? pendingLabel : submitLabel}
          {srLabel ? <span className="sr-only"> {srLabel}</span> : null}
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

export const fieldClasses =
  "min-h-11 rounded-button border border-border bg-surface px-4 text-body text-text";

/** A label, optional hint (id `${id}-hint`), and one control whose id is `id`. */
export function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-small font-medium text-text-secondary">
        {label}
      </label>
      {hint ? (
        <p id={`${id}-hint`} className="text-small text-text-muted">
          {hint}
        </p>
      ) : null}
      {children}
    </div>
  );
}
