"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { getAdminAccess } from "@/lib/data/admin/access";
import { DEPARTMENT_ICON_OPTIONS } from "@/components/department-icon";
import { createDepartment, updateDepartment } from "@/lib/data/admin/departments";
import { getCurrentUser } from "@/lib/data/auth";
import { adminErrorMessage } from "@/lib/domain/admin";
import { DEPARTMENT_HUES } from "@/lib/domain/departments";

export type DepartmentFormState =
  { status: "idle" } | { status: "done"; message: string } | { status: "error"; message: string };

const departmentSchema = z.object({
  departmentId: z.uuid(),
  name: z.string().trim().min(1, "Give the department a name.").max(80),
  summary: z.string().trim().max(300, "Keep the summary under 300 characters."),
  status: z.enum(["active", "coming_soon", "inactive"]),
  enrolmentMode: z.enum(["request", "invite_only"]),
  curriculumRequiresReview: z.boolean(),
});

/** SRS-CUR-009: opening or closing a department is a data change, recorded in the audit log. */
export async function updateDepartmentAction(
  _previous: DepartmentFormState,
  formData: FormData,
): Promise<DepartmentFormState> {
  const parsed = departmentSchema.safeParse({
    departmentId: formData.get("departmentId"),
    name: formData.get("name"),
    summary: formData.get("summary") ?? "",
    status: formData.get("status"),
    enrolmentMode: formData.get("enrolmentMode"),
    curriculumRequiresReview: formData.get("curriculumRequiresReview") === "on",
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? adminErrorMessage("invalid_input"),
    };
  }
  const { allowed } = await getAdminAccess("departments");
  if (!allowed) {
    return { status: "error", message: adminErrorMessage("not_authorized") };
  }
  const { departmentId, ...changes } = parsed.data;
  const result = await updateDepartment(departmentId, changes);
  if (!result.ok) {
    return { status: "error", message: adminErrorMessage(result.error) };
  }
  refresh();
  return { status: "done", message: "Saved." };
}

const newDepartmentSchema = z.object({
  name: z.string().trim().min(1, "Give the department a name.").max(80),
  summary: z.string().trim().max(300, "Keep the summary under 300 characters."),
  hue: z.enum(DEPARTMENT_HUES.map((h) => h.key) as [string, ...string[]]),
  icon: z.enum(DEPARTMENT_ICON_OPTIONS.map((i) => i.key) as [string, ...string[]]),
  status: z.enum(["active", "coming_soon", "inactive"]),
  enrolmentMode: z.enum(["request", "invite_only"]),
});

/**
 * Adds a department (SRS-CUR-009). It gets the three levels straight away, and works like every
 * other department from then on. Recorded in the audit log.
 */
export async function createDepartmentAction(
  _previous: DepartmentFormState,
  formData: FormData,
): Promise<DepartmentFormState> {
  const parsed = newDepartmentSchema.safeParse({
    name: formData.get("name"),
    summary: formData.get("summary") ?? "",
    hue: formData.get("hue"),
    icon: formData.get("icon"),
    status: formData.get("status"),
    enrolmentMode: formData.get("enrolmentMode"),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? adminErrorMessage("invalid_input"),
    };
  }
  const [{ allowed }, user] = await Promise.all([getAdminAccess("departments"), getCurrentUser()]);
  if (!allowed || !user) {
    return { status: "error", message: adminErrorMessage("not_authorized") };
  }
  const result = await createDepartment({ userId: user.id, ...parsed.data });
  if (!result.ok) {
    return { status: "error", message: adminErrorMessage(result.error) };
  }
  refresh();
  return {
    status: "done",
    message: `${parsed.data.name} is added, with its three levels. Set up its courses, positions and onboarding next.`,
  };
}
