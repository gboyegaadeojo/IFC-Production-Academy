"use server";

import { getCurrentUser } from "@/lib/data/auth";
import { getServeSheet } from "@/lib/data/serve-sheet";
import type { ServeSheetSummary } from "@/lib/domain/serve-sheet";

/** The Serve sheet's details, when it opens on a phone. Nothing for anyone not signed in. */
export async function serveSheetAction(): Promise<ServeSheetSummary | null> {
  const user = await getCurrentUser();
  if (user?.status !== "active") {
    return null;
  }
  try {
    return await getServeSheet();
  } catch {
    // The sheet still offers its pages without the details.
    return null;
  }
}
