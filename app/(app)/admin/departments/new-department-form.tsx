"use client";

import type { CSSProperties } from "react";
import { useActionState, useState } from "react";
import { DEPARTMENT_ICON_OPTIONS, DepartmentIcon } from "@/components/department-icon";
import { fieldClasses } from "@/components/ui/action-form";
import { Button } from "@/components/ui/button";
import { DEPARTMENT_HUES, departmentHueVar } from "@/lib/domain/departments";
import { createDepartmentAction, type DepartmentFormState } from "./actions";

const idle: DepartmentFormState = { status: "idle" };

/**
 * Add a department (G, 2026-11-01: "everything follows like the current departments"). It gets the
 * three levels straight away; curriculum, positions, checklists and onboarding are set up the same
 * way as for every other department.
 */
export function NewDepartmentForm() {
  const [state, action, pending] = useActionState(createDepartmentAction, idle);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("livestream");
  const [hue, setHue] = useState("pink");
  const choice =
    "relative flex cursor-pointer items-center justify-center rounded-button border border-border transition-surface hover:border-border-strong has-[:checked]:border-accent has-[:checked]:bg-accent-soft has-[:checked]:shadow-[inset_0_0_0_1px_var(--accent)] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent-light";

  return (
    <form action={action} className="flex flex-col gap-5">
      <div
        style={{ "--dept": departmentHueVar(hue) } as CSSProperties}
        className="flex items-center gap-3 rounded-card border border-border bg-card p-3"
        aria-hidden="true"
      >
        <span className="flex size-10 items-center justify-center rounded-button bg-hover text-[var(--dept)]">
          <DepartmentIcon icon={icon} className="size-5" />
        </span>
        <span className="flex flex-col">
          <span className="font-semibold">{name.trim() || "New department"}</span>
          <span className="text-small text-text-muted">How it will look on Training</span>
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="new-dept-name" className="text-small font-medium text-text-secondary">
          Name
        </label>
        <input
          id="new-dept-name"
          name="name"
          required
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Livestream Operations"
          className={fieldClasses}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="new-dept-summary" className="text-small font-medium text-text-secondary">
          One line about it (optional)
        </label>
        <textarea
          id="new-dept-summary"
          name="summary"
          maxLength={300}
          rows={2}
          placeholder="Run the stream so people at home can join the service."
          className={`${fieldClasses} py-2`}
        />
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-small font-medium text-text-secondary">Icon</legend>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-2">
          {DEPARTMENT_ICON_OPTIONS.map((option) => (
            <label
              key={option.key}
              className={`${choice} flex-col gap-1 p-2 text-center text-small`}
            >
              <input
                type="radio"
                name="icon"
                value={option.key}
                checked={icon === option.key}
                onChange={() => setIcon(option.key)}
                className="sr-only"
              />
              <DepartmentIcon icon={option.key} className="size-5" />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-small font-medium text-text-secondary">Colour</legend>
        <div className="flex flex-wrap gap-2">
          {DEPARTMENT_HUES.map((option) => (
            <label key={option.key} className={`${choice} gap-2 py-1.5 pr-3 pl-2 text-small`}>
              <input
                type="radio"
                name="hue"
                value={option.key}
                checked={hue === option.key}
                onChange={() => setHue(option.key)}
                className="sr-only"
              />
              <span
                aria-hidden="true"
                className="size-4 rounded-pill"
                style={{ background: departmentHueVar(option.key) }}
              />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="new-dept-join" className="text-small font-medium text-text-secondary">
            How people join
          </label>
          <select
            id="new-dept-join"
            name="enrolmentMode"
            defaultValue="request"
            className={fieldClasses}
          >
            <option value="request">They ask, a leader approves</option>
            <option value="invite_only">By invitation only</option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="new-dept-status" className="text-small font-medium text-text-secondary">
            Status
          </label>
          <select
            id="new-dept-status"
            name="status"
            defaultValue="coming_soon"
            className={fieldClasses}
          >
            <option value="coming_soon">Coming soon (seen, can&apos;t join yet)</option>
            <option value="active">Open now</option>
            <option value="inactive">Hidden while you set it up</option>
          </select>
        </div>
      </div>

      {state.status === "error" ? (
        <p role="alert" className="text-small text-error">
          {state.message}
        </p>
      ) : state.status === "done" ? (
        <p role="status" className="text-small text-success">
          {state.message}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Adding…" : "Add department"}
      </Button>
    </form>
  );
}
