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
  buttonClassName,
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
  buttonClassName?: string;
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
          className={buttonClassName}
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

/**
 * For a choice, such as a set of checkboxes: it saves as soon as it changes, with no Save button.
 * Typed text keeps an ActionForm, so nothing is saved halfway through a word.
 */
export function AutoSaveForm({
  action,
  hidden,
  children,
  className = "flex flex-col gap-2",
}: {
  action: FormAction;
  hidden?: Record<string, string>;
  children: ReactNode;
  className?: string;
}) {
  const [state, formAction, pending] = useActionState(action, idle);
  const failed = state.status === "error" && !pending;
  return (
    <form
      action={formAction}
      onChange={(event) => event.currentTarget.requestSubmit()}
      className={className}
    >
      {Object.entries(hidden ?? {}).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {children}
      <p
        role={failed ? "alert" : "status"}
        className={`min-h-[1lh] text-small ${failed ? "text-error" : "text-text-secondary"}`}
      >
        {pending ? "Saving…" : state.status === "idle" ? "" : state.message}
      </p>
    </form>
  );
}

/** Something that's on or off, in one tap. It saves straight away. */
export function SwitchForm({
  action,
  hidden,
  name,
  checked,
  label,
}: {
  action: FormAction;
  hidden?: Record<string, string>;
  /** The form field that carries the new value, "true" or "false". */
  name: string;
  checked: boolean;
  label: string;
}) {
  const [state, formAction, pending] = useActionState(action, idle);
  return (
    <form action={formAction} className="flex max-w-md flex-col gap-1">
      {Object.entries(hidden ?? {}).map(([key, value]) => (
        <input key={key} type="hidden" name={key} value={value} />
      ))}
      <input type="hidden" name={name} value={checked ? "false" : "true"} />
      <div className="flex min-h-control items-center justify-between gap-3">
        <span>{label}</span>
        <button
          type="submit"
          role="switch"
          aria-checked={checked}
          aria-label={label}
          disabled={pending}
          className={`relative h-6 w-10 shrink-0 rounded-pill border transition-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-light pointer-coarse:after:absolute pointer-coarse:after:-inset-2 ${
            checked ? "border-accent bg-accent" : "border-border-strong bg-hover"
          }`}
        >
          <span
            aria-hidden="true"
            className={`absolute top-0.5 left-0.5 size-[1.125rem] rounded-pill transition-transform duration-[var(--duration-base)] motion-reduce:transition-none ${
              checked ? "translate-x-4 bg-on-accent" : "bg-text-muted"
            }`}
          />
        </button>
      </div>
      {state.status === "error" ? (
        <p role="alert" className="text-small text-error">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

export const fieldClasses =
  "min-h-control rounded-button border border-border-strong bg-surface px-3 text-field text-text placeholder:text-text-muted";

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
