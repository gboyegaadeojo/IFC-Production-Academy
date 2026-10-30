"use server";

import { refresh } from "next/cache";
import { getCurrentUser } from "@/lib/data/auth";
import { updateMyDisplayName } from "@/lib/data/profile";
import { displayNameSchema } from "@/lib/domain/profile";

export type ProfileFormState =
  { status: "idle" } | { status: "done"; message: string } | { status: "error"; message: string };

/** SRS-AUTH-006. RLS limits the update to the person's own row and permitted columns. */
export async function updateDisplayNameAction(
  _previous: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const parsed = displayNameSchema.safeParse(formData.get("displayName") ?? "");
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Check your name and try again.",
    };
  }
  const user = await getCurrentUser();
  if (!user || user.status !== "active") {
    return { status: "error", message: "Your session has ended. Sign in again to save." };
  }
  const saved = await updateMyDisplayName(user.id, parsed.data);
  if (!saved) {
    return { status: "error", message: "That didn't save. Check your connection and try again." };
  }
  refresh();
  return { status: "done", message: "Saved." };
}
