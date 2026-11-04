"use client";

import { ActionForm, Field, fieldClasses } from "@/components/ui/action-form";
import { buttonClasses } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { addStageAction, removeStageAction, updateStageAction } from "./actions";

/** Rename a stage or change its timing; an empty stage can be removed. */
export function StageSettings({
  stage,
}: {
  stage: { id: string; name: string; timing: string; stepCount: number };
}) {
  return (
    <section
      aria-labelledby="stage-heading"
      className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4"
    >
      <h4 id="stage-heading" className="font-semibold">
        Edit stage
      </h4>
      <ActionForm
        key={stage.id}
        action={updateStageAction}
        submitLabel="Save stage"
        hidden={{ stageId: stage.id }}
        className="flex flex-col gap-3"
      >
        <Field id="stage-name" label="Name">
          <input
            id="stage-name"
            name="name"
            required
            maxLength={80}
            defaultValue={stage.name}
            className={fieldClasses}
          />
        </Field>
        <Field id="stage-timing" label="When" hint="For example “Within 3 days” or “Week 2”.">
          <input
            id="stage-timing"
            name="timing"
            maxLength={40}
            defaultValue={stage.timing}
            className={fieldClasses}
          />
        </Field>
      </ActionForm>
      {stage.stepCount === 0 ? (
        <ConfirmDialog
          triggerLabel="Remove stage"
          variant="secondary"
          title={`Remove “${stage.name}”?`}
          message="It has no steps, so nobody is affected."
        >
          <ActionForm
            action={removeStageAction}
            submitLabel="Remove stage"
            variant="destructive"
            hidden={{ stageId: stage.id }}
          />
        </ConfirmDialog>
      ) : (
        <p className="text-small text-text-muted">
          To remove this stage, move or remove its steps first.
        </p>
      )}
    </section>
  );
}

export function AddStage({ pathwayId }: { pathwayId: string }) {
  return (
    <details className="group">
      <summary
        className={`${buttonClasses("secondary", "w-fit")} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}
      >
        Add a stage
      </summary>
      <ActionForm
        action={addStageAction}
        submitLabel="Add stage"
        hidden={{ pathwayId }}
        className="mt-3 flex w-80 max-w-full flex-col gap-3 rounded-card border border-border bg-surface p-4"
      >
        <Field id="new-stage-name" label="Name">
          <input
            id="new-stage-name"
            name="name"
            required
            maxLength={80}
            placeholder="Getting started"
            className={fieldClasses}
          />
        </Field>
        <Field id="new-stage-timing" label="When (optional)">
          <input
            id="new-stage-timing"
            name="timing"
            maxLength={40}
            placeholder="Week 1"
            className={fieldClasses}
          />
        </Field>
      </ActionForm>
    </details>
  );
}
