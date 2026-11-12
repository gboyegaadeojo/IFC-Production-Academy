import "server-only";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/data/supabase/admin";
import { createSupabaseServerClient } from "@/lib/data/supabase/server";
import {
  DEADLINE_COUNTING,
  isAllowedGraphic,
  LATE_POLICIES,
  REQUEST_KINDS,
  REQUEST_STATUSES,
  safeFileName,
  type RequestForm,
} from "@/lib/domain/copyright";

// Video and graphics approvals (ADD-COPY-01..10). The database decides who may do what; these read
// its answers with zod and pass values on. Only the file links use the server's storage key.

const BUCKET = "copyright";

const formSchema = z.object({
  open: z.boolean(),
  deadlineDays: z.number().int(),
  deadlineCounting: z.enum(DEADLINE_COUNTING),
  latePolicy: z.enum(LATE_POLICIES),
  introText: z.string(),
  today: z.string(),
  services: z.array(
    z.object({ id: z.string(), title: z.string(), startsAt: z.string(), day: z.string() }),
  ),
});
export type CopyrightFormInfo = z.infer<typeof formSchema>;

const CLOSED: CopyrightFormInfo = {
  open: false,
  deadlineDays: 5,
  deadlineCounting: "calendar",
  latePolicy: "accept",
  introText: "",
  today: "",
  services: [],
};

/** What the public form needs: whether it's open, the deadline, and upcoming services. */
export async function getCopyrightForm(): Promise<CopyrightFormInfo> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("copyright_form");
  if (error) {
    throw new Error("Could not load the request form", { cause: error.code });
  }
  const parsed = formSchema.safeParse(data);
  return parsed.success ? parsed.data : CLOSED;
}

export type SubmitResult =
  | { ok: true; reference: string | null; statusToken: string | null; isLate: boolean }
  | {
      ok: false;
      error: "closed" | "too_many" | "too_late" | "unknown_service" | "invalid" | "failed";
    };

const submitSchema = z.object({
  reference: z.string(),
  statusToken: z.string(),
  isLate: z.boolean(),
});

const SUBMIT_ERRORS: Record<string, Exclude<SubmitResult, { ok: true }>["error"]> = {
  copyright_off: "closed",
  too_many_requests: "too_many",
  too_late: "too_late",
  unknown_service: "unknown_service",
  invalid_date: "invalid",
  invalid_request: "invalid",
};

/** Sends a request. A bot that filled the hidden field gets a quiet success with nothing behind it. */
export async function submitCopyrightRequest(form: RequestForm): Promise<SubmitResult> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("submit_copyright_request", {
    p_first_name: form.firstName,
    p_last_name: form.lastName,
    p_email: form.email,
    p_kind: form.kind,
    p_media_url: form.mediaUrl || null,
    p_file_path: form.kind === "graphic" ? form.filePath || null : null,
    p_event_id: form.eventId || null,
    p_other_date: form.eventId ? null : form.otherDate || null,
    p_description: form.description,
    p_website: form.website,
  });
  if (error) {
    return { ok: false, error: SUBMIT_ERRORS[error.message] ?? "failed" };
  }
  const parsed = submitSchema.safeParse(data);
  return parsed.success
    ? { ok: true, ...parsed.data }
    : { ok: true, reference: null, statusToken: null, isLate: false };
}

const statusSchema = z.object({
  reference: z.string(),
  kind: z.enum(REQUEST_KINDS),
  description: z.string(),
  serviceLabel: z.string(),
  status: z.enum(REQUEST_STATUSES),
  hadCopyrightReview: z.boolean(),
  isLate: z.boolean(),
  createdAt: z.string(),
  decidedAt: z.string().nullable(),
  decisionNote: z.string().nullable(),
});
export type RequestStatusView = z.infer<typeof statusSchema>;

/** The requester's status page, from the secret in their email; null for a wrong secret. */
export async function getRequestStatus(token: string): Promise<RequestStatusView | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("copyright_request_status", { p_token: token });
  if (error) {
    throw new Error("Could not load the request", { cause: error.code });
  }
  const parsed = statusSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

export type UploadSlot = { ok: true; path: string; url: string } | { ok: false; error: string };

/**
 * A one-time place to upload a graphic, before the request is sent. Only while the form is open,
 * only allowed types and sizes. The browser sends the file straight to storage with it.
 */
export async function createGraphicUploadSlot(file: {
  name: string;
  type: string;
  size: number;
}): Promise<UploadSlot> {
  if (!isAllowedGraphic(file.type, file.size)) {
    return { ok: false, error: "Upload a PNG, JPEG, WebP or PDF of up to 20 MB." };
  }
  if (!(await getCopyrightForm()).open) {
    return { ok: false, error: "Requests are paused right now." };
  }
  const admin = createSupabaseAdminClient();
  if (!admin) {
    return { ok: false, error: "Uploads aren't set up yet. Paste a link to the graphic instead." };
  }
  const path = `requests/${crypto.randomUUID()}/${safeFileName(file.name)}`;
  const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error) {
    return { ok: false, error: "That upload didn't start. Try again, or paste a link instead." };
  }
  return { ok: true, path: data.path, url: data.signedUrl };
}

/** A one-minute link to a request's file, for someone the database has already said may see it. */
export async function signedFileUrl(path: string): Promise<string | null> {
  const admin = createSupabaseAdminClient();
  if (!admin) {
    return null;
  }
  const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(path, 60);
  return error ? null : data.signedUrl;
}
