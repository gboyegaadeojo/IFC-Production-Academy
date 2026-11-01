"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { FormState } from "@/components/ui/action-form";
import { getCurrentUser } from "@/lib/data/auth";
import * as onboarding from "@/lib/data/onboarding";
import { createSupabaseServerClient } from "@/lib/data/supabase/server";
import {
  planStepDrop,
  planStepMove,
  STEP_CONFIG,
  STEP_KINDS,
  type OrderedStage,
  type StepKind,
} from "@/lib/domain/onboarding";

// Onboarding pathway builder (docs/decisions/2026-11-01-onboarding-pathways.md). Every input is
// checked here; row-level security decides who may change which pathway.

const id = z.uuid();
const name = z.string().trim().min(1, "Give it a name.").max(120, "Keep it under 120 characters.");
const stageName = z.string().trim().min(1, "Name the stage.").max(80);
const timing = z.string().trim().max(40, "Keep the timing short, like “Within 3 days”.");
const kind = z.enum(Object.keys(STEP_KINDS) as [StepKind, ...StepKind[]]);

const MESSAGES: Record<string, string> = {
  not_authorized: "You can only change pathways you look after.",
  stage_not_empty: "Move or remove this stage's steps first.",
  unknown: "That didn't save. Check your connection and try again.",
};
const failed = (error: string): FormState => ({
  status: "error",
  message: MESSAGES[error] ?? MESSAGES.unknown!,
});

async function signedIn(): Promise<{ id: string } | null> {
  const user = await getCurrentUser();
  return user && user.status === "active" ? { id: user.id } : null;
}

export async function createPathwayAction(_: FormState, formData: FormData): Promise<FormState> {
  const user = await signedIn();
  const departmentId = z
    .union([id, z.literal("")])
    .transform((v) => v || null)
    .safeParse(formData.get("departmentId") ?? "");
  const parsedName = name.safeParse(formData.get("name"));
  if (!user || !departmentId.success || !parsedName.success) {
    return failed(parsedName.success ? "unknown" : "unknown");
  }
  const supabase = await createSupabaseServerClient();
  const profile = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", user.id)
    .single();
  if (profile.error) {
    return failed("unknown");
  }
  const created = await onboarding.createPathway({
    organizationId: profile.data.organization_id,
    departmentId: departmentId.data,
    name: parsedName.data,
  });
  if (!created.ok) {
    return failed(created.error);
  }
  redirect(`/admin/onboarding?pathway=${created.id}`);
}

export async function updatePathwayAction(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = z.object({ pathwayId: id, name, summary: z.string().trim().max(500) }).safeParse({
    pathwayId: formData.get("pathwayId"),
    name: formData.get("name"),
    summary: formData.get("summary") ?? "",
  });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? MESSAGES.unknown! };
  }
  const saved = await onboarding.updatePathway(
    parsed.data.pathwayId,
    parsed.data.name,
    parsed.data.summary,
  );
  if (!saved.ok) {
    return failed(saved.error);
  }
  refresh();
  return { status: "done", message: "Saved." };
}

export async function addStageAction(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = z.object({ pathwayId: id, name: stageName, timing }).safeParse({
    pathwayId: formData.get("pathwayId"),
    name: formData.get("name"),
    timing: formData.get("timing") ?? "",
  });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? MESSAGES.unknown! };
  }
  const saved = await onboarding.addStage(
    parsed.data.pathwayId,
    parsed.data.name,
    parsed.data.timing,
  );
  if (!saved.ok) {
    return failed(saved.error);
  }
  refresh();
  return { status: "done", message: "Stage added." };
}

export async function updateStageAction(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = z.object({ stageId: id, name: stageName, timing }).safeParse({
    stageId: formData.get("stageId"),
    name: formData.get("name"),
    timing: formData.get("timing") ?? "",
  });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? MESSAGES.unknown! };
  }
  const saved = await onboarding.updateStage(
    parsed.data.stageId,
    parsed.data.name,
    parsed.data.timing,
  );
  if (!saved.ok) {
    return failed(saved.error);
  }
  refresh();
  return { status: "done", message: "Saved." };
}

export async function moveStageAction(
  pathwayId: string,
  stageId: string,
  direction: "up" | "down",
): Promise<void> {
  if (!id.safeParse(pathwayId).success || !id.safeParse(stageId).success || !(await signedIn())) {
    return;
  }
  await onboarding.moveStage(pathwayId, stageId, direction === "up" ? "up" : "down");
  refresh();
}

export async function removeStageAction(_: FormState, formData: FormData): Promise<FormState> {
  const stageId = id.safeParse(formData.get("stageId"));
  if (!stageId.success) {
    return failed("unknown");
  }
  const removed = await onboarding.removeStage(stageId.data);
  if (!removed.ok) {
    return failed(removed.error);
  }
  refresh();
  return { status: "done", message: "Stage removed." };
}

/** Adds a step from the library, after the selected step or at the end of the last stage. */
export async function addStepAction(input: {
  pathwayId: string;
  stageId: string;
  afterStepId: string | null;
  kind: string;
}): Promise<{ ok: boolean; stepId?: string }> {
  const parsed = z
    .object({ pathwayId: id, stageId: id, afterStepId: id.nullable(), kind })
    .safeParse(input);
  if (!parsed.success || !(await signedIn())) {
    return { ok: false };
  }
  const meta = STEP_KINDS[parsed.data.kind];
  if (!meta.available) {
    return { ok: false };
  }
  const added = await onboarding.addStep({
    pathwayId: parsed.data.pathwayId,
    stageId: parsed.data.stageId,
    kind: parsed.data.kind,
    title: meta.label,
    config: {},
    afterStepId: parsed.data.afterStepId,
  });
  refresh();
  return added.ok ? { ok: true, stepId: added.id } : { ok: false };
}

const stagesInput = z.array(z.object({ id, steps: z.array(z.object({ id })) })).max(50);

/** Moves a step up or down (keyboard and buttons). */
export async function moveStepAction(
  stages: OrderedStage[],
  stepId: string,
  direction: "up" | "down",
): Promise<void> {
  const parsed = stagesInput.safeParse(stages);
  if (!parsed.success || !id.safeParse(stepId).success || !(await signedIn())) {
    return;
  }
  await onboarding.placeSteps(
    planStepMove(parsed.data, stepId, direction === "up" ? "up" : "down"),
  );
  refresh();
}

/** Places a step where it was dropped. */
export async function dropStepAction(
  stages: OrderedStage[],
  stepId: string,
  toStageId: string,
  toIndex: number,
): Promise<void> {
  const parsed = stagesInput.safeParse(stages);
  const index = z.number().int().min(0).max(500).safeParse(toIndex);
  if (
    !parsed.success ||
    !index.success ||
    !id.safeParse(stepId).success ||
    !id.safeParse(toStageId).success ||
    !(await signedIn())
  ) {
    return;
  }
  await onboarding.placeSteps(planStepDrop(parsed.data, stepId, toStageId, index.data));
  refresh();
}

/** Saves a step's name and settings, checked against what its kind needs. */
export async function saveStepAction(_: FormState, formData: FormData): Promise<FormState> {
  const base = z
    .object({ stepId: id, kind, title: z.string().trim().min(1, "Name the step.").max(120) })
    .safeParse({
      stepId: formData.get("stepId"),
      kind: formData.get("kind"),
      title: formData.get("title"),
    });
  if (!base.success) {
    return { status: "error", message: base.error.issues[0]?.message ?? MESSAGES.unknown! };
  }
  const raw = Object.fromEntries(
    [...formData.entries()]
      .filter(([key]) => key.startsWith("cfg_"))
      .map(([key, value]) => [key.slice(4), typeof value === "string" ? value : ""]),
  );
  const config = STEP_CONFIG[base.data.kind].safeParse(raw);
  if (!config.success) {
    return {
      status: "error",
      message: config.error.issues[0]?.message ?? "Check the step's settings.",
    };
  }
  const cleaned = Object.fromEntries(
    Object.entries(config.data as Record<string, unknown>).filter(([, v]) => v !== undefined),
  );
  const saved = await onboarding.updateStep(base.data.stepId, base.data.title, cleaned);
  if (!saved.ok) {
    return failed(saved.error);
  }
  refresh();
  return { status: "done", message: "Saved." };
}

export async function removeStepAction(_: FormState, formData: FormData): Promise<FormState> {
  const stepId = id.safeParse(formData.get("stepId"));
  const pathwayId = id.safeParse(formData.get("pathwayId"));
  if (!stepId.success || !pathwayId.success) {
    return failed("unknown");
  }
  const removed = await onboarding.removeStep(stepId.data);
  if (!removed.ok) {
    return failed(removed.error);
  }
  redirect(`/admin/onboarding?pathway=${pathwayId.data}`);
}
