"use client";

import { useActionState, useId, useState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { requestMagicLink, signInWithGoogle, type MagicLinkState } from "./actions";

const initialState: MagicLinkState = { status: "idle" };

export function SignInForm({ next }: { next: string }) {
  // Changing the key resets the email form after "Use a different email".
  const [attempt, setAttempt] = useState(0);
  return <SignInFormInner key={attempt} next={next} onReset={() => setAttempt((n) => n + 1)} />;
}

function SignInFormInner({ next, onReset }: { next: string; onReset: () => void }) {
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
    <div className="flex flex-col gap-6">
      <form action={signInWithGoogle}>
        <input type="hidden" name="next" value={next} />
        <GoogleButton />
      </form>

      <div className="flex items-center gap-3 text-small text-text-muted" aria-hidden="true">
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>

      <form action={formAction} className="flex flex-col gap-3" noValidate>
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
          className="min-h-11 rounded-button border border-border bg-surface px-4 text-body text-text placeholder:text-text-muted aria-invalid:border-error"
        />
        {state.status === "error" ? (
          <p id={errorId} role="alert" className="text-small text-error">
            {state.message}
          </p>
        ) : null}
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "Sending your link…" : "Email me a sign-in link"}
        </Button>
      </form>
    </div>
  );
}

function GoogleButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Opening Google…" : "Continue with Google"}
    </Button>
  );
}
