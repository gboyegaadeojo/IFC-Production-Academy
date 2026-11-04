"use client";

import { useState, type ReactNode } from "react";
import type { Choice, CourseChoice } from "@/lib/data/onboarding";
import type { StepKind } from "@/lib/domain/onboarding";
import { Builder, type BuilderStage } from "./builder";
import { AddStage, StageSettings } from "./stage-settings";
import { StepSettings } from "./step-settings";

export type WorkspaceStep = {
  id: string;
  kind: StepKind;
  title: string;
  config: Record<string, unknown>;
};

type Selection = { kind: "step" | "stage"; id: string } | null;

/**
 * The pathway builder, with settings opening inside the chosen step or stage. Choosing one happens
 * in the browser, with no trip to the server, and the address keeps ?step= or ?stage= so a reload
 * opens the same thing. Choosing it again closes it. Saving still goes to the server, which sends
 * back the updated pathway.
 */
export function Workspace({
  pathwayId,
  header,
  stages,
  steps,
  roles,
  people,
  courses,
  servingRoles,
  departments,
  initial,
}: {
  pathwayId: string;
  header: ReactNode;
  stages: BuilderStage[];
  steps: WorkspaceStep[];
  roles: Choice[];
  people: Choice[];
  courses: CourseChoice[];
  servingRoles: Choice[];
  departments: (Choice & { pathwayId: string | null })[];
  initial: Selection;
}) {
  const [selection, setSelection] = useState<Selection>(initial);

  function select(next: Selection) {
    const same = next && selection?.kind === next.kind && selection.id === next.id;
    const chosen = same ? null : next;
    setSelection(chosen);
    const query = chosen ? `&${chosen.kind}=${chosen.id}` : "";
    window.history.replaceState(null, "", `/admin/onboarding?pathway=${pathwayId}${query}`);
  }

  const step = selection?.kind === "step" ? steps.find((s) => s.id === selection.id) : undefined;
  const stage = selection?.kind === "stage" ? stages.find((s) => s.id === selection.id) : undefined;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {header}
      <Builder
        pathwayId={pathwayId}
        stages={stages}
        selectedStepId={step?.id ?? null}
        selectedStageId={stage?.id ?? null}
        onSelectStep={(id) => select({ kind: "step", id })}
        onSelectStage={(id) => select({ kind: "stage", id })}
        stepPanel={
          step ? (
            <StepSettings
              key={step.id}
              pathwayId={pathwayId}
              step={step}
              roles={roles}
              people={people}
              courses={courses}
              servingRoles={servingRoles}
              departments={departments}
            />
          ) : null
        }
        stagePanel={
          stage ? (
            <StageSettings
              key={stage.id}
              stage={{
                id: stage.id,
                name: stage.name,
                timing: stage.timing,
                stepCount: stage.steps.length,
              }}
            />
          ) : null
        }
        footer={<AddStage pathwayId={pathwayId} />}
      />
    </div>
  );
}
