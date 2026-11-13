import "server-only";
import { getMyCapabilities } from "@/lib/data/capabilities";
import { getCurrentServiceId, getServiceChecklists, getServiceHeader } from "@/lib/data/checklists";
import { getMyReviews } from "@/lib/data/copyright";
import { createSupabaseServerClient } from "@/lib/data/supabase/server";
import {
  checklistProgress,
  type ServeSheetService,
  type ServeSheetSummary,
} from "@/lib/domain/serve-sheet";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * What the Serve sheet shows (sheet B, G 2026-11-13), loaded when it opens rather than on every
 * page. Everything is read as the signed-in person, so row-level security decides what's there.
 */
export async function getServeSheet(): Promise<ServeSheetSummary> {
  const [service, sopsUpdatedThisWeek, copyright] = await Promise.all([
    nextService(),
    sopsUpdatedSince(new Date(Date.now() - WEEK_MS).toISOString()),
    waitingReviews(),
  ]);
  return { service, sopsUpdatedThisWeek, copyright };
}

/** Today's service or the next one, as the checklist opens it, without opening one. */
async function nextService(): Promise<ServeSheetService | null> {
  const id = await getCurrentServiceId();
  if (!id) {
    return null;
  }
  const [header, checklists] = await Promise.all([getServiceHeader(id), getServiceChecklists(id)]);
  if (!header || header.cancelled) {
    return null;
  }
  const scheduled = checklists?.state.isScheduled ?? false;
  const { done, total } = checklistProgress(checklists?.checklists ?? [], scheduled);
  return {
    id: header.id,
    title: header.title,
    startsAt: header.startsAt,
    positions: scheduled ? (checklists?.state.myPositions ?? []) : [],
    done,
    total,
  };
}

/** How many SOPs the person can read had a new version published since then. */
async function sopsUpdatedSince(since: string): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("sop_versions")
    .select("sop_id")
    .eq("status", "published")
    .gte("published_at", since);
  return error ? 0 : new Set(data.map((row) => row.sop_id)).size;
}

/** For copyright reviewers: how many wait, and the soonest service day among them. */
async function waitingReviews(): Promise<ServeSheetSummary["copyright"]> {
  const grants = await getMyCapabilities();
  if (!grants.some((grant) => grant.capability === "copyright.review")) {
    return null;
  }
  const waiting = (await getMyReviews())
    .filter((row) => row.status === "with_copyright_review")
    .toSorted((a, b) => a.serviceDay.localeCompare(b.serviceDay));
  return { waiting: waiting.length, firstDay: waiting[0]?.serviceDay ?? null };
}
