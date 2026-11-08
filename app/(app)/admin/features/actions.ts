"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/components/ui/action-form";
import { getAdminAccess } from "@/lib/data/admin/access";
import { setFeatureFlag } from "@/lib/data/features";
import { isFeatureKey } from "@/lib/domain/features";

const input = z.object({
  key: z.string().refine(isFeatureKey),
  enabled: z.enum(["true", "false"]).transform((value) => value === "true"),
});

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
