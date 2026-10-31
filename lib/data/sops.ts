import "server-only";
import { createSupabaseServerClient } from "@/lib/data/supabase/server";
import { hasCapability, type CapabilityGrant } from "@/lib/domain/capabilities";
import {
  sopFileExtension,
  sopState,
  toSopError,
  type SopError,
  type SopFileType,
  type SopState,
  type SopVersionStatus,
} from "@/lib/domain/sops";

// SOP library (SRS-SOP-001..006). Row-level security decides what each person reads: members of a
// department see its live SOPs, curriculum staff see everything in their departments. Files sit in
// a private Storage bucket; the storage policies decide who may open or upload each one.

const BUCKET = "sops";
/** Signed links last a minute: long enough to open, too short to be worth sharing. */
const SIGNED_URL_SECONDS = 60;

type Client = Awaited<ReturnType<typeof createSupabaseServerClient>>;
export type SopResult = { ok: true } | { ok: false; error: SopError };
type WithId<T> = { ok: true; id: T } | { ok: false; error: SopError };

function fail(error: { code?: string; message?: string } | null): { ok: false; error: SopError } {
  return { ok: false, error: toSopError(error) };
}

function updated(result: {
  data: unknown[] | null;
  error: { code?: string; message?: string } | null;
}): SopResult {
  if (result.error) {
    return fail(result.error);
  }
  return (result.data?.length ?? 0) > 0 ? { ok: true } : fail({ code: "42501" });
}

export type SopVersionSummary = {
  id: string;
  status: SopVersionStatus;
  versionNumber: number | null;
  title: string;
  summary: string;
  fileName: string | null;
  fileSize: number | null;
  fileType: string | null;
  changeNote: string | null;
  publishedAt: string | null;
};

export type SopSummary = {
  id: string;
  department: { id: string; name: string; slug: string; hue: string };
  category: string;
  ownerName: string | null;
  reviewIntervalMonths: number;
  lastReviewedAt: string | null;
  archivedAt: string | null;
  state: SopState;
  /** The current version, if published. */
  current: SopVersionSummary | null;
  /** The open draft, visible to curriculum staff only. */
  draft: SopVersionSummary | null;
  /** Every version the person can see, newest first. */
  versions: SopVersionSummary[];
};

const VERSION_COLUMNS =
  "id, sop_id, status, version_number, title, summary, file_name, file_size, file_type, change_note, published_at";

type VersionRow = {
  id: string;
  sop_id: string;
  status: SopVersionStatus;
  version_number: number | null;
  title: string;
  summary: string;
  file_name: string | null;
  file_size: number | null;
  file_type: string | null;
  change_note: string | null;
  published_at: string | null;
};

function toVersion(row: VersionRow): SopVersionSummary {
  return {
    id: row.id,
    status: row.status,
    versionNumber: row.version_number,
    title: row.title,
    summary: row.summary,
    fileName: row.file_name,
    fileSize: row.file_size,
    fileType: row.file_type,
    changeNote: row.change_note,
    publishedAt: row.published_at,
  };
}

async function loadSops(
  supabase: Client,
  filter: { ids?: string[]; departmentIds?: string[]; includeArchived?: boolean },
): Promise<SopSummary[]> {
  let query = supabase
    .from("sops")
    .select("id, department_id, category, review_interval_months, last_reviewed_at, archived_at")
    .limit(1000);
  if (filter.ids) {
    query = query.in("id", filter.ids);
  }
  if (filter.departmentIds) {
    query = query.in("department_id", filter.departmentIds);
  }
  if (!filter.includeArchived) {
    query = query.is("archived_at", null);
  }
  const sops = await query;
  if (sops.error) {
    throw new Error("Could not load SOPs", { cause: sops.error.code });
  }
  if (sops.data.length === 0) {
    return [];
  }
  const ids = sops.data.map((sop) => sop.id);
  const [versions, departments, owners] = await Promise.all([
    supabase
      .from("sop_versions")
      .select(VERSION_COLUMNS)
      .in("sop_id", ids)
      .order("version_number", { ascending: false, nullsFirst: true }),
    supabase
      .from("departments")
      .select("id, name, slug, hue")
      .in("id", [...new Set(sops.data.map((sop) => sop.department_id))]),
    supabase.rpc("sop_owner_names", { p_sop_ids: ids }),
  ]);
  if (versions.error || departments.error || owners.error) {
    throw new Error("Could not load SOPs", {
      cause: (versions.error ?? departments.error ?? owners.error)?.code,
    });
  }
  const now = new Date();
  const ownerNames = new Map(owners.data.map((row) => [row.sop_id, row.owner_name]));
  return sops.data.flatMap((sop) => {
    const department = departments.data.find((d) => d.id === sop.department_id);
    if (!department) {
      return [];
    }
    const mine = versions.data.filter((v) => v.sop_id === sop.id).map(toVersion);
    const current = mine.find((v) => v.status === "published") ?? null;
    return [
      {
        id: sop.id,
        department,
        category: sop.category,
        ownerName: ownerNames.get(sop.id) ?? null,
        reviewIntervalMonths: sop.review_interval_months,
        lastReviewedAt: sop.last_reviewed_at,
        archivedAt: sop.archived_at,
        state: sopState(
          {
            archivedAt: sop.archived_at,
            lastReviewedAt: sop.last_reviewed_at,
            reviewIntervalMonths: sop.review_interval_months,
          },
          current !== null,
          now,
        ),
        current,
        draft: mine.find((v) => v.status === "draft") ?? null,
        versions: mine,
      },
    ];
  });
}

function titleOf(sop: SopSummary): string {
  return (sop.current ?? sop.draft ?? sop.versions[0])?.title ?? "Untitled SOP";
}

/** Live SOPs the person can read, by title (SRS-SOP-001). Members see published ones only. */
export async function getSopLibrary(): Promise<SopSummary[]> {
  const supabase = await createSupabaseServerClient();
  return (await loadSops(supabase, {}))
    .filter((sop) => sop.current !== null)
    .toSorted((a, b) => titleOf(a).localeCompare(titleOf(b)));
}

/** One SOP with its history. Null if it can't be read. */
export async function getSop(sopId: string): Promise<SopSummary | null> {
  const supabase = await createSupabaseServerClient();
  const [sop] = await loadSops(supabase, { ids: [sopId], includeArchived: true });
  return sop ?? null;
}

/** Every SOP, including drafts and archived ones, in departments the person looks after. */
export async function getSopsForStaff(departmentIds: string[]): Promise<SopSummary[]> {
  if (departmentIds.length === 0) {
    return [];
  }
  const supabase = await createSupabaseServerClient();
  return (await loadSops(supabase, { departmentIds, includeArchived: true })).toSorted((a, b) =>
    titleOf(a).localeCompare(titleOf(b)),
  );
}

export { titleOf as sopTitle };

/**
 * A short-lived link to a version's file. The storage policies check the person may open it:
 * members only the current version, curriculum staff any. Null when not allowed or missing.
 */
export async function getSopFileUrl(versionId: string): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const version = await supabase
    .from("sop_versions")
    .select("file_path, file_name")
    .eq("id", versionId)
    .maybeSingle();
  if (version.error || !version.data?.file_path) {
    return null;
  }
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(version.data.file_path, SIGNED_URL_SECONDS);
  return error || !data ? null : data.signedUrl;
}

// ---------------------------------------------------------------------------
// Changes
// ---------------------------------------------------------------------------

export async function createSop(departmentId: string, title: string): Promise<WithId<string>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("create_sop", {
    p_department_id: departmentId,
    p_title: title,
  });
  return error ? fail(error) : { ok: true, id: data };
}

export async function startSopDraft(sopId: string): Promise<WithId<string>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("start_sop_draft", { p_sop_id: sopId });
  return error ? fail(error) : { ok: true, id: data };
}

export async function updateSopDraft(
  versionId: string,
  details: { title: string; summary: string },
): Promise<SopResult> {
  const supabase = await createSupabaseServerClient();
  return updated(
    await supabase
      .from("sop_versions")
      .update({ title: details.title, summary: details.summary })
      .eq("id", versionId)
      .select("id"),
  );
}

export async function updateSopSettings(
  sopId: string,
  settings: { category: string; reviewIntervalMonths: number },
): Promise<SopResult> {
  const supabase = await createSupabaseServerClient();
  return updated(
    await supabase
      .from("sops")
      .update({
        category: settings.category,
        review_interval_months: settings.reviewIntervalMonths,
      })
      .eq("id", sopId)
      .select("id"),
  );
}

/**
 * Stores a new file for the draft and points the draft at it. Each upload gets a new name, so a
 * published file is never overwritten. The old draft file, if any, stays (backups keep files).
 */
export async function uploadSopFile(
  versionId: string,
  file: { bytes: Uint8Array; name: string; type: SopFileType },
): Promise<SopResult> {
  const supabase = await createSupabaseServerClient();
  const version = await supabase
    .from("sop_versions")
    .select("sop_id, department_id, status")
    .eq("id", versionId)
    .maybeSingle();
  if (version.error || !version.data || version.data.status !== "draft") {
    return fail(version.error ?? { code: "42501" });
  }
  const path = `${version.data.department_id}/${version.data.sop_id}/${crypto.randomUUID()}.${sopFileExtension(file.type)}`;
  const upload = await supabase.storage.from(BUCKET).upload(path, file.bytes, {
    contentType: file.type,
    upsert: false,
  });
  if (upload.error) {
    return fail({ code: "42501" });
  }
  return updated(
    await supabase
      .from("sop_versions")
      .update({
        file_path: path,
        file_name: file.name,
        file_size: file.bytes.byteLength,
        file_type: file.type,
      })
      .eq("id", versionId)
      .select("id"),
  );
}

export async function publishSopVersion(
  versionId: string,
  changeNote: string,
): Promise<WithId<number>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("publish_sop_version", {
    p_version_id: versionId,
    p_change_note: changeNote,
  });
  return error ? fail(error) : { ok: true, id: data };
}

export async function markSopReviewed(sopId: string): Promise<SopResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("mark_sop_reviewed", { p_sop_id: sopId });
  return error ? fail(error) : { ok: true };
}

export async function archiveSop(sopId: string): Promise<SopResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("archive_sop", { p_sop_id: sopId });
  return error ? fail(error) : { ok: true };
}

// ---------------------------------------------------------------------------
// Lesson resources (SRS-LESSON-005)
// ---------------------------------------------------------------------------

export type LessonResource = {
  id: string;
  sopId: string;
  title: string;
  state: SopState;
  fileType: string | null;
};

/** SOPs attached to a lesson that the person can read, live ones only for members. */
export async function getLessonResources(lessonId: string): Promise<LessonResource[]> {
  const supabase = await createSupabaseServerClient();
  const links = await supabase
    .from("lesson_resources")
    .select("id, sop_id, sort_order")
    .eq("lesson_id", lessonId)
    .order("sort_order");
  if (links.error) {
    throw new Error("Could not load resources", { cause: links.error.code });
  }
  if (links.data.length === 0) {
    return [];
  }
  const sops = await loadSops(supabase, {
    ids: links.data.map((link) => link.sop_id),
    includeArchived: true,
  });
  return links.data.flatMap((link) => {
    const sop = sops.find((candidate) => candidate.id === link.sop_id);
    return sop
      ? [
          {
            id: link.id,
            sopId: sop.id,
            title: titleOf(sop),
            state: sop.state,
            fileType: sop.current?.fileType ?? null,
          },
        ]
      : [];
  });
}

export async function addLessonResource(lessonId: string, sopId: string): Promise<SopResult> {
  const supabase = await createSupabaseServerClient();
  const existing = await supabase
    .from("lesson_resources")
    .select("sort_order")
    .eq("lesson_id", lessonId);
  const sortOrder =
    (existing.data ?? []).reduce((max, row) => Math.max(max, row.sort_order), 0) + 10;
  const { error } = await supabase
    .from("lesson_resources")
    .insert({ lesson_id: lessonId, sop_id: sopId, sort_order: sortOrder });
  if (error?.code === "23505") {
    return { ok: true };
  }
  return error ? fail(error) : { ok: true };
}

export async function removeLessonResource(resourceId: string): Promise<SopResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("remove_lesson_resource", { p_resource_id: resourceId });
  return error ? fail(error) : { ok: true };
}

/** Departments whose SOPs the person looks after (course.draft or course.publish). */
export async function getSopDepartments(
  grants: readonly CapabilityGrant[],
): Promise<{ id: string; name: string; canDraft: boolean; canPublish: boolean }[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("departments")
    .select("id, name, sort_order")
    .order("sort_order");
  if (error) {
    throw new Error("Could not load departments", { cause: error.code });
  }
  return data
    .map((d) => ({
      id: d.id,
      name: d.name,
      canDraft: hasCapability(grants, "course.draft", d.id),
      canPublish: hasCapability(grants, "course.publish", d.id),
    }))
    .filter((d) => d.canDraft || d.canPublish);
}
