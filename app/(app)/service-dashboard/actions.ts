"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireActiveUser } from "@/lib/data/auth";
import { saveServiceNote } from "@/lib/data/service-dashboard";
import { dashboardErrorMessage } from "@/lib/domain/service-dashboard";

const noteInput = z.object({ eventId: z.uuid(), body: z.string().max(4000) });

/** Saves this service's producer notes (ADD-DASH-05). The database checks who may. */
export async function saveNoteAction(input: {
  eventId: string;
  body: string;
}): Promise<{ ok: boolean; message: string }> {
  const parsed = noteInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Those notes are too long. Shorten them, then try again." };
  }
  await requireActiveUser();
  const result = await saveServiceNote(parsed.data.eventId, parsed.data.body);
  if (!result.ok) {
    return { ok: false, message: dashboardErrorMessage(result.error) };
  }
  refresh();
  return { ok: true, message: "Saved." };
}
