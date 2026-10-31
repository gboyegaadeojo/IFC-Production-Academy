"use client";

import { useActionState, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { requestMagicLink, type MagicLinkState } from "./actions";

const initialState: MagicLinkState = { status: "idle" };

/** `invite` carries an invitation token through sign-in, so the person lands back on it. */
export function SignInForm({ invite }: { invite?: string }) {
  // Changing the key resets the email form after "Use a different email".
  const [attempt, setAttempt] = useState(0);
  return <SignInFormInner key={attempt} invite={invite} onReset={() => setAttempt((n) => n + 1)} />;
}

function SignInFormInner({ invite, onReset }: { invite?: string; onReset: () => void }) {
  const [state, formAction, pending] = useActionState(requestMagicLink, initialState);
  const emailId = useId();
  const errorId = useId();

  if (state.status === "sent") {
    return (
      <div role="status" className="flex flex-col gap-4">
        <h2 className="text-subheading font-semibold">Check your email</h2>
        <p className="text-text-secondary">
          We sent a sign-in link to <span className="font-medium text-text">{state.email}</span>. It
          works once and expires in an hour.
        </p>
        <Button variant="tertiary" className="self-start px-0" onClick={onReset}>
          Use a different email
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3" noValidate>
      {invite ? <input type="hidden" name="invite" value={invite} /> : null}
      <label htmlFor={emailId} className="text-small font-medium text-text-secondary">
        Email address
      </label>
      <input
        id={emailId}
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        required
        placeholder="name@example.com"
        aria-invalid={state.status === "error"}
        aria-describedby={state.status === "error" ? errorId : undefined}
        className="min-h-control rounded-button border border-border-strong bg-surface px-3 text-body text-text placeholder:text-text-muted aria-invalid:border-error"
      />
      {state.status === "error" ? (
        <p id={errorId} role="alert" className="text-small text-error">
          {state.message}
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Sending your link…" : "Email me a sign-in link"}
      </Button>
    </form>
  );
}
