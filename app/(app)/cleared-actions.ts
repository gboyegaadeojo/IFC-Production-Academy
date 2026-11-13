"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { setClearedLoaded } from "@/lib/data/copyright";

/**
 * Ticks a cleared video or graphic as loaded for the service, or un-ticks it (ADD-COPY-08). The
 * tick is shared: everyone on duty sees it. The database checks the person is on duty.
 */
export async function setLoadedAction(requestId: string, loaded: boolean): Promise<boolean> {
  const parsed = z
    .object({ id: z.uuid(), loaded: z.boolean() })
    .safeParse({ id: requestId, loaded });
  if (!parsed.success) {
    return false;
  }
  const ok = await setClearedLoaded(parsed.data.id, parsed.data.loaded);
  if (ok) {
    refresh();
  }
  return ok;
}
