"use client";

import { useState } from "react";
import { ActionForm, Field, fieldClasses } from "@/components/ui/action-form";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  ASSIGN_MODE_LABELS,
  ASSIGN_MODES,
  STEP_KINDS,
  type AssignMode,
  type StepKind,
} from "@/lib/domain/onboarding";
import type { Choice } from "@/lib/data/onboarding";
import { removeStepAction, saveStepAction } from "./actions";
import { TONE } from "./builder";
import { StepIcon } from "./step-icon";

/**
 * Edit one step (approved mock, 2026-11-01): its name and what it does. Each kind shows only the
 * settings it needs; the server checks them again before saving.
 */
export function StepSettings({
  pathwayId,
  step,
  roles,
  people,
  courses,
  servingRoles,
}: {
  pathwayId: string;
  step: { id: string; kind: StepKind; title: string; config: Record<string, unknown> };
  roles: Choice[];
  people: Choice[];
  courses: Choice[];
  servingRoles: Choice[];
}) {
  const meta = STEP_KINDS[step.kind];
  const c = step.config;
  const text = (key: string, fallback = "") => (c[key] === undefined ? fallback : String(c[key]));
  const [mode, setMode] = useState<AssignMode>((c.mode as AssignMode) ?? "turns");
  const id = (key: string) => `step-${step.id}-${key}`;
  const select = (key: string, label: string, choices: Choice[], hint?: string, empty?: string) => (
    <Field id={id(key)} label={label} hint={hint}>
      <select id={id(key)} name={`cfg_${key}`} defaultValue={text(key)} className={fieldClasses}>
        {empty !== undefined ? <option value="">{empty}</option> : null}
        {choices.map((choice) => (
          <option key={choice.id} value={choice.id}>
            {choice.name}
          </option>
        ))}
      </select>
    </Field>
  );

  return (
    <section
      aria-labelledby="settings-heading"
      className="flex flex-col gap-4 rounded-card border border-border bg-surface p-4"
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className={`flex size-9 items-center justify-center rounded-[10px] ${TONE[meta.tone]}`}
        >
          <StepIcon kind={step.kind} className="size-[18px]" />
        </span>
        <div className="flex flex-col">
          <h2 id="settings-heading" className="font-semibold">
            {meta.label}
          </h2>
          <span className="text-small text-text-muted">
            {meta.waits ? "Waits here until done" : "Happens straight away"}
          </span>
        </div>
      </div>

      <ActionForm
        key={step.id}
        action={saveStepAction}
        submitLabel="Save step"
        hidden={{ stepId: step.id, kind: step.kind }}
        className="flex flex-col gap-4"
      >
        <Field id={id("title")} label="Step name">
          <input
            id={id("title")}
            name="title"
            defaultValue={step.title}
            maxLength={120}
            required
            className={fieldClasses}
          />
        </Field>

        {step.kind === "email" ? (
          <>
            <Field id={id("subject")} label="Subject">
              <input
                id={id("subject")}
                name="cfg_subject"
                defaultValue={text("subject")}
                maxLength={150}
                className={fieldClasses}
              />
            </Field>
            <Field
              id={id("body")}
              label="Message"
              hint="{first name} becomes their first name. Emails are held until volunteer emails are switched on at launch."
            >
              <textarea
                id={id("body")}
                name="cfg_body"
                defaultValue={text("body")}
                rows={7}
                maxLength={3000}
                className={`${fieldClasses} py-2`}
              />
            </Field>
          </>
        ) : null}

        {step.kind === "notify"
          ? select(
              "role_id",
              "Who to tell",
              roles,
              undefined,
              "Everyone who looks after this pathway",
            )
          : null}

        {step.kind === "task" || step.kind === "mentor" ? (
          <>
            {select(
              "role_id",
              "From",
              roles,
              "The leaders this follow-up comes from.",
              "Choose leaders",
            )}
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-small font-medium text-text-secondary">
                Who reaches out
              </legend>
              {ASSIGN_MODES.map((m) => (
                <label
                  key={m}
                  className="flex cursor-pointer items-start gap-2.5 rounded-button border border-border p-2.5 text-small has-[:checked]:border-accent has-[:checked]:bg-accent-soft"
                >
                  <input
                    type="radio"
                    name="cfg_mode"
                    value={m}
                    checked={mode === m}
                    onChange={() => setMode(m)}
                    className="mt-0.5 accent-[var(--accent)]"
                  />
                  <span className="flex flex-col">
                    <span className="font-semibold text-text">{ASSIGN_MODE_LABELS[m].label}</span>
                    <span className="text-text-secondary">{ASSIGN_MODE_LABELS[m].hint}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            {mode === "person"
              ? select("person_id", "Person", people, undefined, "Choose a person")
              : null}
            <p className="text-small text-text-muted">
              Anyone who looks after this pathway can hand someone over later, in Follow-ups. The
              volunteer always sees who their contact is.
            </p>
            <Field id={id("due")} label="Due within (hours)" hint="72 hours is 3 days.">
              <input
                id={id("due")}
                name="cfg_due_hours"
                type="number"
                inputMode="numeric"
                min={1}
                max={1440}
                defaultValue={text("due_hours", "72")}
                className={`${fieldClasses} w-32`}
              />
            </Field>
            <Field id={id("detail")} label="What to do">
              <textarea
                id={id("detail")}
                name="cfg_detail"
                defaultValue={text("detail")}
                rows={3}
                maxLength={1000}
                className={`${fieldClasses} py-2`}
              />
            </Field>
          </>
        ) : null}

        {step.kind === "course" ? (
          <>
            {select("course_id", "Course", courses, undefined, "Choose a published course")}
            <p className="rounded-button border border-border bg-card p-2.5 text-small text-text-secondary">
              <span className="font-semibold text-text">Moves on by itself</span> when the Academy
              records the course finished. Nobody ticks it. Assigning it makes them a member of the
              course&apos;s department, which gives them the training, not approval to serve.
            </p>
          </>
        ) : null}

        {step.kind === "wait" ? (
          <Field id={id("days")} label="Days">
            <input
              id={id("days")}
              name="cfg_days"
              type="number"
              min={1}
              max={60}
              defaultValue={text("days", "3")}
              className={`${fieldClasses} w-32`}
            />
          </Field>
        ) : null}

        {step.kind === "pco_team" ? (
          <>
            {select("serving_role_id", "Position", servingRoles, undefined, "Choose a position")}
            <p className="rounded-button border border-border bg-card p-2.5 text-small text-text-secondary">
              <span className="font-semibold text-text">Planning Center stays read-only.</span> A
              leader adds them there; this step completes itself when the next sync (every 15
              minutes) sees them on the team.
            </p>
          </>
        ) : null}

        {step.kind === "branch" ? (
          <p className="text-small text-text-secondary">
            The volunteer picks from the open departments; that department&apos;s pathway starts.
          </p>
        ) : null}
      </ActionForm>

      <ConfirmDialog
        triggerLabel="Remove step"
        srLabel={step.title}
        variant="secondary"
        title={`Remove “${step.title}”?`}
        message="People at this step move on to the next one. Their history still shows it."
      >
        <ActionForm
          action={removeStepAction}
          submitLabel="Remove step"
          variant="destructive"
          hidden={{ stepId: step.id, pathwayId }}
        />
      </ConfirmDialog>
    </section>
  );
}
