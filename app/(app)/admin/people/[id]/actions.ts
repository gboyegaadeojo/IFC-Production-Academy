"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { getAdminAccess } from "@/lib/data/admin/access";
import { grantRole, revokeRole, setAccountStatus } from "@/lib/data/admin/people";
import { adminErrorMessage } from "@/lib/domain/admin";
import { hasCapability } from "@/lib/domain/capabilities";

export type FormState =
  { status: "idle" } | { status: "done"; message: string } | { status: "error"; message: string };

const optionalText = z
  .string()
  .trim()
  .max(500)
  .transform((value) => (value === "" ? null : value));

const grantSchema = z.object({
  userId: z.uuid(),
  roleId: z.uuid(),
  departmentId: z.union([z.uuid(), z.literal("")]).transform((value) => value || null),
});

/** SRS-RBAC-002, SRS-AUTH-007. The database checks role.assign, scope, and escalation. */
export async function grantRoleAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = grantSchema.safeParse({
    userId: formData.get("userId"),
    roleId: formData.get("roleId"),
    departmentId: formData.get("departmentId") ?? "",
  });
  if (!parsed.success) {
    return { status: "error", message: "Choose a role first." };
  }
  const { grants, allowed } = await getAdminAccess("people");
  if (!allowed || !hasCapability(grants, "role.assign")) {
    return { status: "error", message: adminErrorMessage("not_authorized") };
  }
  const result = await grantRole(parsed.data.userId, parsed.data.roleId, parsed.data.departmentId);
  if (!result.ok) {
    return { status: "error", message: adminErrorMessage(result.error) };
  }
  refresh();
  return { status: "done", message: "Role granted." };
}

const revokeSchema = z.object({ userRoleId: z.uuid() });

export async function revokeRoleAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = revokeSchema.safeParse({ userRoleId: formData.get("userRoleId") });
  if (!parsed.success) {
    return { status: "error", message: adminErrorMessage("invalid_input") };
  }
  const { grants, allowed } = await getAdminAccess("people");
  if (!allowed || !hasCapability(grants, "role.assign")) {
    return { status: "error", message: adminErrorMessage("not_authorized") };
  }
  const result = await revokeRole(parsed.data.userRoleId);
  if (!result.ok) {
    return { status: "error", message: adminErrorMessage(result.error) };
  }
  refresh();
  return { status: "done", message: "Role removed. The grant stays in their history." };
}

const statusSchema = z
  .object({
    userId: z.uuid(),
    status: z.enum(["active", "suspended", "deactivated"]),
    reason: optionalText,
  })
  .refine((value) => value.status === "active" || value.reason !== null, {
    message: "Add a short reason. It's kept with the account history.",
  });

/** SRS-AUTH-004. Training history is kept whatever the status. */
export async function setAccountStatusAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = statusSchema.safeParse({
    userId: formData.get("userId"),
    status: formData.get("status"),
    reason: formData.get("reason") ?? "",
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? adminErrorMessage("invalid_input"),
    };
  }
  const { grants, allowed } = await getAdminAccess("people");
  if (!allowed || !hasCapability(grants, "user.manage")) {
    return { status: "error", message: adminErrorMessage("not_authorized") };
  }
  const result = await setAccountStatus(parsed.data.userId, parsed.data.status, parsed.data.reason);
  if (!result.ok) {
    return { status: "error", message: adminErrorMessage(result.error) };
  }
  refresh();
  return { status: "done", message: "Account status updated." };
}
