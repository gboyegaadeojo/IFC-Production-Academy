"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/components/ui/action-form";
import { getAdminAccess } from "@/lib/data/admin/access";
import { setProblemReportStatus } from "@/lib/data/problem-reports";

const input = z.object({
  id: z.uuid(),
  sorted: z.enum(["true", "false"]).transform((value) => value === "true"),
});

/** Marks a report sorted, or open again. The database checks problem.review and audits it. */
export async function setReportStatusAction(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = input.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", message: "That didn't work. Refresh the page and try again." };
  }
  const { allowed } = await getAdminAccess("problem-reports");
  if (!allowed || !(await setProblemReportStatus(parsed.data.id, parsed.data.sorted))) {
    return {
      status: "error",
      message: "That didn't save. Check that your role allows this, then try again.",
    };
  }
  refresh();
  return { status: "done", message: parsed.data.sorted ? "Marked as sorted." : "Opened again." };
}
