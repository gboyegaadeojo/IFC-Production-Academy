"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireActiveUser } from "@/lib/data/auth";
import { approveScreen, removeScreen, setYoutubeChannel } from "@/lib/data/screens";
import {
  saveServiceDashboardLayout,
  setServiceDashboardEditor,
} from "@/lib/data/service-dashboard";
import {
  dashboardErrorMessage,
  type DashboardLayout,
  layoutSchema,
} from "@/lib/domain/service-dashboard";
import { youtubeChannelSchema } from "@/lib/domain/youtube-stream";

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

const addScreenInput = z.object({
  code: z.string().trim().min(1).max(12),
  name: z.string().trim().min(1).max(60),
});

export async function addScreenAction(input: { code: string; name: string }): Promise<SetupResult> {
  const parsed = addScreenInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Enter the code on the TV and a name for the screen." };
  }
  await requireActiveUser();
  const result = await approveScreen(parsed.data.code, parsed.data.name);
  if (!result.ok) {
    return {
      ok: false,
      message:
        result.error === "screen_code_not_found"
          ? "That code doesn't match a waiting TV. Check the screen, as codes change after 15 minutes."
          : dashboardErrorMessage(result.error),
    };
  }
  refresh();
  return {
    ok: true,
    message: `${parsed.data.name} added. The TV shows the dashboard within a few seconds.`,
  };
}

const removeScreenInput = z.object({ id: z.uuid(), name: z.string().max(60) });

export async function removeScreenAction(input: {
  id: string;
  name: string;
}): Promise<SetupResult> {
  const parsed = removeScreenInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: dashboardErrorMessage("unknown") };
  }
  await requireActiveUser();
  const result = await removeScreen(parsed.data.id);
  if (!result.ok) {
    return {
      ok: false,
      message:
        result.error === "screen_code_not_found"
          ? dashboardErrorMessage("unknown")
          : dashboardErrorMessage(result.error),
    };
  }
  refresh();
  return { ok: true, message: `${parsed.data.name} removed. It goes back to showing a code.` };
}

export async function setChannelAction(input: { channelId: string }): Promise<SetupResult> {
  const parsed = youtubeChannelSchema.safeParse(input.channelId);
  if (!parsed.success) {
    return {
      ok: false,
      message: "That doesn't look like a channel ID. It starts with UC and is 24 characters.",
    };
  }
  await requireActiveUser();
  const result = await setYoutubeChannel(parsed.data);
  if (!result.ok) {
    return {
      ok: false,
      message:
        result.error === "screen_code_not_found"
          ? dashboardErrorMessage("unknown")
          : dashboardErrorMessage(result.error),
    };
  }
  refresh();
  return { ok: true, message: parsed.data ? "Channel saved." : "Channel cleared." };
}
