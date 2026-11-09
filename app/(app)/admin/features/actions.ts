"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/components/ui/action-form";
import { getAdminAccess } from "@/lib/data/admin/access";
import { setFeatureFlag, setMessagingRetention } from "@/lib/data/features";
import { isFeatureKey } from "@/lib/domain/features";

const input = z.object({
  key: z.string().refine(isFeatureKey),
  enabled: z.enum(["true", "false"]).transform((value) => value === "true"),
});

const retention = z.object({
  chatFileDays: z.coerce.number().int().min(30).max(365),
  messageTextYears: z.coerce.number().int().min(1).max(10),
});

/** How long chat files and message text are kept (ADD-MSG-05). Audited by the database. */
export async function setRetentionAction(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = retention.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      status: "error",
      message: "Choose 30 to 365 days for files, and 1 to 10 years for messages.",
    };
  }
  const { allowed } = await getAdminAccess("features");
  if (!allowed || !(await setMessagingRetention(parsed.data))) {
    return {
      status: "error",
      message: "That didn't save. Check that your role allows this, then try again.",
    };
  }
  refresh();
  return { status: "done", message: "Saved. The daily cleanup uses it from tomorrow." };
}

/** Switches a module on or off (ADD-FLAG-01). The database checks feature.manage and audits it. */
export async function setFeatureFlagAction(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = input.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", message: "That didn't work. Refresh the page and try again." };
  }
  const { allowed } = await getAdminAccess("features");
  const key = parsed.data.key;
  if (!allowed || !isFeatureKey(key) || !(await setFeatureFlag(key, parsed.data.enabled))) {
    return {
      status: "error",
      message: "That didn't save. Check that your role allows this, then try again.",
    };
  }
  refresh();
  return { status: "done", message: parsed.data.enabled ? "Switched on." : "Switched off." };
}
