import "server-only";
import { createSupabaseServerClient } from "@/lib/data/supabase/server";
import { toPlanError, type PlanError } from "@/lib/domain/plan";
import { safeFileName } from "@/lib/domain/service-files";

// Files on a service (plan "Academy scheduling", PR 10). Storage policies and the database decide
// who may add or open them; signed links last a few minutes.

const BUCKET = "service-files";
const SIGNED_URL_SECONDS = 300;

export type ServiceFile = {
  id: string;
  eventId: string;
  name: string;
  mimeType: string;
  bytes: number;
  /** A short-lived link, or null if it couldn't be made. */
  url: string | null;
};

/** Files on these services that the person may open, newest first. */
export async function getServiceFiles(eventIds: string[]): Promise<ServiceFile[]> {
  if (eventIds.length === 0) {
    return [];
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("service_files")
    .select("id, event_id, path, name, mime_type, bytes")
    .in("event_id", eventIds)
    .order("created_at", { ascending: false });
  if (error) {
    throw new Error("Could not load files", { cause: error.code });
  }
  if (data.length === 0) {
    return [];
  }
  const signed = await supabase.storage.from(BUCKET).createSignedUrls(
    data.map((file) => file.path),
    SIGNED_URL_SECONDS,
  );
  return data.map((file) => ({
    id: file.id,
    eventId: file.event_id,
    name: file.name,
    mimeType: file.mime_type,
    bytes: file.bytes,
    url: signed.data?.find((link) => link.path === file.path)?.signedUrl ?? null,
  }));
}

export async function addServiceFile(
  eventId: string,
  file: File,
): Promise<{ ok: true } | { ok: false; error: PlanError }> {
  const supabase = await createSupabaseServerClient();
  const path = `${eventId}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
  const upload = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false, cacheControl: "300" });
  if (upload.error) {
    return { ok: false, error: "not_authorized" };
  }
  const { error } = await supabase.rpc("add_service_file", {
    p_event_id: eventId,
    p_path: path,
    p_name: file.name,
    p_mime_type: file.type,
    p_bytes: file.size,
  });
  if (error) {
    await supabase.storage.from(BUCKET).remove([path]);
    return { ok: false, error: toPlanError(error) };
  }
  return { ok: true };
}

export async function removeServiceFile(
  id: string,
): Promise<{ ok: true } | { ok: false; error: PlanError }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("remove_service_file", { p_id: id });
  if (error) {
    return { ok: false, error: toPlanError(error) };
  }
  await supabase.storage.from(BUCKET).remove([data]);
  return { ok: true };
}
