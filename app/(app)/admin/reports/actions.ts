"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/components/ui/action-form";
import { getAdminAccess } from "@/lib/data/admin/access";
import { assignCourse, removeCourseAssignment } from "@/lib/data/course-assignments";
import { hasCapability } from "@/lib/domain/capabilities";

// Assigning a course (ADD-REPORT-03). The database checks course.assign as well, and audits it.

const assignment = z.object({ courseId: z.uuid(), departmentId: z.uuid(), userId: z.uuid() });

async function mayAssign(departmentId: string): Promise<boolean> {
  const { grants } = await getAdminAccess("reports");
  return hasCapability(grants, "course.assign", departmentId);
}

export async function assignCourseAction(_: FormState, formData: FormData): Promise<FormState> {
  const input = assignment.safeParse(Object.fromEntries(formData));
  if (!input.success) {
    return { status: "error", message: "Choose someone first." };
  }
  const { courseId, departmentId, userId } = input.data;
  if (!(await mayAssign(departmentId)) || !(await assignCourse(courseId, userId))) {
    return { status: "error", message: "That didn't work. Check your connection and try again." };
  }
  refresh();
  return { status: "done", message: "Assigned. They'll see it on Training." };
}

export async function removeAssignmentAction(_: FormState, formData: FormData): Promise<FormState> {
  const input = assignment.safeParse(Object.fromEntries(formData));
  if (
    !input.success ||
    !(await mayAssign(input.data.departmentId)) ||
    !(await removeCourseAssignment(input.data.courseId, input.data.userId))
  ) {
    return { status: "error", message: "That didn't work. Check your connection and try again." };
  }
  refresh();
  return { status: "done", message: "Removed. Anything they've already done stays." };
}
