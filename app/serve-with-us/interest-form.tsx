"use client";

import type { CSSProperties } from "react";
import { useActionState, useId } from "react";
import { DepartmentIcon } from "@/components/department-icon";
import { fieldClasses } from "@/components/ui/action-form";
import { Button } from "@/components/ui/button";
import { departmentHueVar } from "@/lib/domain/departments";
import { submitInterestAction, type InterestState } from "./actions";

const idle: InterestState = { status: "idle" };

export function InterestForm({
  departments,
}: {
  departments: { id: string; name: string; hue: string; icon: string }[];
}) {
  const [state, action, pending] = useActionState(submitInterestAction, idle);
  const ids = {
    name: useId(),
    email: useId(),
    phone: useId(),
    message: useId(),
    interests: useId(),
    error: useId(),
  };

  if (state.status === "sent") {
    return (
      <div
        role="status"
        className="flex flex-col gap-2 rounded-card border border-success-line bg-success-soft p-5"
      >
        <h2 className="text-heading font-semibold">Thanks, {state.firstName}.</h2>
        <p className="text-text-secondary">
          A leader will be in touch within a few days to say hello and find a time to chat. You
          don&apos;t need to do anything else for now.
        </p>
      </div>
    );
  }

  return (
    <form
      action={action}
      className="flex flex-col gap-4 rounded-card border border-border bg-surface p-5 sm:p-6"
      aria-labelledby="form-heading"
    >
      <h2 id="form-heading" className="text-heading font-semibold">
        I&apos;d like to serve
      </h2>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={ids.name} className="text-small font-medium text-text-secondary">
          Your name
        </label>
        <input
          id={ids.name}
          name="name"
          required
          maxLength={120}
          autoComplete="name"
          className={fieldClasses}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={ids.email} className="text-small font-medium text-text-secondary">
          Email
        </label>
        <input
          id={ids.email}
          name="email"
          type="email"
          required
          maxLength={254}
          autoComplete="email"
          className={fieldClasses}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={ids.phone} className="text-small font-medium text-text-secondary">
          Phone (optional)
        </label>
        <input
          id={ids.phone}
          name="phone"
          type="tel"
          maxLength={40}
          autoComplete="tel"
          className={fieldClasses}
        />
      </div>
      {departments.length > 0 ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-small font-medium text-text-secondary">
            What interests you? Pick any, or none yet
          </legend>
          <div className="flex flex-wrap gap-2">
            {departments.map((d) => (
              <label
                key={d.id}
                style={{ "--dept": departmentHueVar(d.hue) } as CSSProperties}
                className="flex cursor-pointer items-center gap-2 rounded-button border border-border bg-surface py-1.5 pr-3 pl-1.5 text-small transition-surface hover:border-border-strong has-[:checked]:border-accent has-[:checked]:bg-accent-soft has-[:checked]:font-semibold has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent-light"
              >
                <input type="checkbox" name="interests" value={d.id} className="sr-only" />
                <span
                  aria-hidden="true"
                  className="flex size-6 items-center justify-center rounded-[6px] bg-hover text-[var(--dept)]"
                >
                  <DepartmentIcon icon={d.icon} className="size-3.5" />
                </span>
                {d.name}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
      <div className="flex flex-col gap-1.5">
        <label htmlFor={ids.message} className="text-small font-medium text-text-secondary">
          Anything you&apos;d like us to know? (optional)
        </label>
        <textarea
          id={ids.message}
          name="message"
          rows={3}
          maxLength={1000}
          className={`${fieldClasses} py-2`}
        />
      </div>
      {/* Hidden from people and screen readers; only bots fill it in. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      {state.status === "error" ? (
        <p id={ids.error} role="alert" className="text-small text-error">
          {state.message}
        </p>
      ) : null}
      <Button
        type="submit"
        disabled={pending}
        aria-describedby={state.status === "error" ? ids.error : undefined}
      >
        {pending ? "Sending…" : "Send"}
      </Button>
      <p className="text-small text-text-muted">
        We only use your details to help you join the team.
      </p>
    </form>
  );
}
