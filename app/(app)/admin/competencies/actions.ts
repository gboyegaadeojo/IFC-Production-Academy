"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/components/ui/action-form";
import { getAdminAccess } from "@/lib/data/admin/access";
import * as competency from "@/lib/data/competency";
import {
  competencyErrorMessage,
  competencySchema,
  servingRoleSchema,
  suspendReasonSchema,
  type CompetencyError,
} from "@/lib/domain/competency";

// Competencies and serving roles (SRS-COMP-001..004, -008). Validate with Zod, fail fast without
// access, then let row-level security and the database functions decide.

const id = z.uuid();
const text = (value: FormDataEntryValue | null) => (typeof value === "string" ? value : "");

function error(message: string): FormState {
  return { status: "error", message };
}
function failed(code: CompetencyError): FormState {
  return error(competencyErrorMessage(code));
}
function firstIssue(result: { error: z.ZodError }): FormState {
  return error(result.error.issues[0]?.message ?? competencyErrorMessage("unknown"));
}
async function allowed(): Promise<boolean> {
  return (await getAdminAccess("competencies")).allowed;
}
function done(message: string): FormState {
  refresh();
  return { status: "done", message };
}

function readCompetency(formData: FormData) {
  return competencySchema.safeParse({
    name: text(formData.get("name")),
    description: text(formData.get("description")),
    expiryMonths: text(formData.get("expiryMonths")),
  });
}

export async function createCompetencyAction(_: FormState, formData: FormData): Promise<FormState> {
  const departmentId = id.safeParse(formData.get("departmentId"));
  const input = readCompetency(formData);
  if (!departmentId.success) {
    return failed("unknown");
  }
  if (!input.success) {
    return firstIssue(input);
  }
  if (!(await allowed())) {
    return failed("not_authorized");
  }
  const result = await competency.createCompetency(departmentId.data, input.data);
  return result.ok ? done("Competency added.") : failed(result.error);
}

export async function updateCompetencyAction(_: FormState, formData: FormData): Promise<FormState> {
  const competencyId = id.safeParse(formData.get("competencyId"));
  const input = readCompetency(formData);
  if (!competencyId.success) {
    return failed("unknown");
  }
  if (!input.success) {
    return firstIssue(input);
  }
  if (!(await allowed())) {
    return failed("not_authorized");
  }
  const result = await competency.updateCompetency(competencyId.data, input.data);
  return result.ok ? done("Saved.") : failed(result.error);
}

export async function archiveCompetencyAction(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const competencyId = id.safeParse(formData.get("competencyId"));
  if (!competencyId.success || !(await allowed())) {
    return failed("not_authorized");
  }
  const result = await competency.archiveCompetency(competencyId.data);
  return result.ok
    ? done("Archived. Roles no longer need it, and people's records are kept.")
    : failed(result.error);
}

export async function createServingRoleAction(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const departmentId = id.safeParse(formData.get("departmentId"));
  const input = servingRoleSchema.safeParse({
    name: text(formData.get("name")),
    description: text(formData.get("description")),
  });
  if (!departmentId.success) {
    return failed("unknown");
  }
  if (!input.success) {
    return firstIssue(input);
  }
  if (!(await allowed())) {
    return failed("not_authorized");
  }
  const result = await competency.createServingRole(departmentId.data, input.data);
  return result.ok ? done("Role added. Choose the competencies it needs.") : failed(result.error);
}

export async function setRoleCompetenciesAction(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const roleId = id.safeParse(formData.get("roleId"));
  const competencyIds = z.array(z.uuid()).max(50).safeParse(formData.getAll("competencyId"));
  if (!roleId.success || !competencyIds.success || !(await allowed())) {
    return failed("not_authorized");
  }
  const result = await competency.setRoleCompetencies(roleId.data, competencyIds.data);
  return result.ok
    ? done("Saved. Approved to Serve has been worked out again for everyone.")
    : failed(result.error);
}

export async function archiveServingRoleAction(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const roleId = id.safeParse(formData.get("roleId"));
  if (!roleId.success || !(await allowed())) {
    return failed("not_authorized");
  }
  const result = await competency.archiveServingRole(roleId.data);
  return result.ok ? done("Role archived. Its approvals were withdrawn.") : failed(result.error);
}

export async function suspendCompetencyAction(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const recordId = id.safeParse(formData.get("recordId"));
  const reason = suspendReasonSchema.safeParse(text(formData.get("reason")));
  if (!recordId.success) {
    return failed("unknown");
  }
  if (!reason.success) {
    return firstIssue(reason);
  }
  if (!(await allowed())) {
    return failed("not_authorized");
  }
  const result = await competency.suspendCompetency(recordId.data, reason.data);
  return result.ok
    ? done("Suspended. Approved to Serve for roles that need it was withdrawn.")
    : failed(result.error);
}

export async function reinstateCompetencyAction(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const recordId = id.safeParse(formData.get("recordId"));
  if (!recordId.success || !(await allowed())) {
    return failed("not_authorized");
  }
  const result = await competency.reinstateCompetency(recordId.data);
  return result.ok ? done("Reinstated.") : failed(result.error);
}
