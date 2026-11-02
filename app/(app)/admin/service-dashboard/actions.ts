"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireActiveUser } from "@/lib/data/auth";
import {
  saveServiceDashboardLayout,
  setServiceDashboardEditor,
} from "@/lib/data/service-dashboard";
import {
  dashboardErrorMessage,
  type DashboardLayout,
  layoutSchema,
} from "@/lib/domain/service-dashboard";

// Service Dashboard setup (ADD-DASH-03). The database checks who may do each of these and logs it.

export type SetupResult = { ok: true; message: string } | { ok: false; message: string };

export async function saveLayoutAction(input: DashboardLayout): Promise<SetupResult> {
  const parsed = layoutSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Check the layout name, then try again." };
  }
  await requireActiveUser();
  const result = await saveServiceDashboardLayout(parsed.data);
  if (!result.ok) {
    return { ok: false, message: dashboardErrorMessage(result.error) };
  }
  refresh();
  return { ok: true, message: "Layout saved. Every screen picks it up when it next loads." };
}

const editorInput = z.object({ userId: z.uuid(), isEditor: z.boolean() });

export async function setEditorAction(input: {
  userId: string;
  isEditor: boolean;
}): Promise<SetupResult> {
  const parsed = editorInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: dashboardErrorMessage("unknown") };
  }
  await requireActiveUser();
  const result = await setServiceDashboardEditor(parsed.data.userId, parsed.data.isEditor);
  if (!result.ok) {
    return { ok: false, message: dashboardErrorMessage(result.error) };
  }
  refresh();
  return { ok: true, message: parsed.data.isEditor ? "Editor added." : "Editor removed." };
}
