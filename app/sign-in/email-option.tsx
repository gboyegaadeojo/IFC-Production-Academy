"use client";

import { useState } from "react";
import { SignInForm } from "./sign-in-form";

/**
 * The email link, second to Planning Center (sign-in option A, approved 2026-11-06): a quiet
 * button that opens the email form in its place. It starts open after an error, so the message and
 * the form are already showing.
 */
export function EmailOption({ initiallyOpen }: { initiallyOpen: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  if (open) {
    return <SignInForm />;
  }
  return (
    <button
      type="button"
      aria-expanded={false}
      onClick={() => setOpen(true)}
      className="inline-flex h-[50px] w-full items-center justify-center rounded-pill border border-border bg-surface px-5 font-semibold text-text transition-surface hover:bg-hover"
    >
      Sign in with an email link
    </button>
  );
}
