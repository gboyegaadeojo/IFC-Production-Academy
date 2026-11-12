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

// Quality control and reviewers (ADD-COPY-04..07). Each call passes the private link's secret or
// relies on the signed-in person; the database checks both.

const rowSchema = z.object({
  id: z.string(),
  reference: z.string(),
  kind: z.enum(REQUEST_KINDS),
  description: z.string(),
  requesterName: z.string(),
  serviceDay: z.string(),
  serviceLabel: z.string(),
  isLate: z.boolean(),
  status: z.enum(REQUEST_STATUSES),
  claimedBy: z.string().nullable(),
  reviewers: z
    .array(z.string().nullable())
    .transform((names) => names.filter((name): name is string => name !== null)),
  createdAt: z.string(),
  decidedAt: z.string().nullable(),
});
export type RequestRow = z.infer<typeof rowSchema>;

const detailSchema = z.object({
  id: z.string(),
  reference: z.string(),
  kind: z.enum(REQUEST_KINDS),
  description: z.string(),
  requesterName: z.string(),
  requesterEmail: z.string(),
  mediaUrl: z.string().nullable(),
  hasFile: z.boolean(),
  serviceDay: z.string(),
  serviceLabel: z.string(),
  eventId: z.string().nullable(),
  isLate: z.boolean(),
  leadDays: z.number(),
  status: z.enum(REQUEST_STATUSES),
  claimedBy: z.string().nullable(),
  question: z.string().nullable(),
  sentForReviewBy: z.string().nullable(),
  planItemId: z.string().nullable(),
  decidedBy: z.string().nullable(),
  decisionNote: z.string().nullable(),
  decidedAt: z.string().nullable(),
  createdAt: z.string(),
  checks: z.array(z.string()).catch([]),
  planItems: z.array(z.object({ id: z.string(), title: z.string() })).catch([]),
});
export type RequestDetail = z.infer<typeof detailSchema>;

const reviewerSchema = z.object({
  kind: z.enum(["member", "outside"]),
  id: z.string(),
  name: z.string(),
});
export type ReviewerChoice = z.infer<typeof reviewerSchema>;

export type ActionResult = { ok: true } | { ok: false; error: string };

const ACTION_ERRORS: Record<string, string> = {
  link_expired: "This link has stopped working. Use the link in your latest email.",
  already_decided: "Someone has already dealt with this request.",
  question_needed: "Say what the reviewer should check.",
  reviewer_needed: "Choose at least one reviewer.",
  not_authorized: "This isn't open to you.",
};

function actionResult(error: { message?: string } | null): ActionResult {
  if (!error) {
    return { ok: true };
  }
  return { ok: false, error: ACTION_ERRORS[error.message ?? ""] ?? "That didn't save. Try again." };
}

/** Quality control's open and recent requests, or null if the link isn't good. */
export async function getQualityControlRequests(
  token: string,
): Promise<{ me: string; requests: RequestRow[] } | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("copyright_qc_requests", { p_token: token });
  if (error) {
    throw new Error("Could not load the requests", { cause: error.code });
  }
  const parsed = z.object({ me: z.string(), requests: z.array(rowSchema) }).safeParse(data);
  return parsed.success ? parsed.data : null;
}

/** Opens one request for Quality control, putting their name on a new one. */
export async function openQualityControlRequest(
  token: string,
  requestId: string,
): Promise<(RequestDetail & { me: string; reviewers: ReviewerChoice[] }) | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("copyright_qc_open", {
    p_token: token,
    p_request: requestId,
  });
  if (error) {
    throw new Error("Could not open the request", { cause: error.code });
  }
  const parsed = detailSchema
    .extend({ me: z.string(), reviewers: z.array(reviewerSchema) })
    .safeParse(data);
  return parsed.success ? parsed.data : null;
}

export async function qualityControlDecide(input: {
  token: string;
  requestId: string;
  approve: boolean;
  note: string;
  planItemId: string | null;
}): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("copyright_qc_decide", {
    p_token: input.token,
    p_request: input.requestId,
    p_approve: input.approve,
    p_note: input.note,
    p_plan_item: input.planItemId,
  });
  return actionResult(error);
}

export async function qualityControlSendForReview(input: {
  token: string;
  requestId: string;
  members: string[];
  outside: string[];
  question: string;
  planItemId: string | null;
}): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("copyright_qc_send_for_review", {
    p_token: input.token,
    p_request: input.requestId,
    p_members: input.members,
    p_outside: input.outside,
    p_question: input.question,
    p_plan_item: input.planItemId,
  });
  return actionResult(error);
}

/** An outside reviewer's one request, or null once decided, expired, or for a wrong link. */
export async function getOutsideReview(
  token: string,
): Promise<(RequestDetail & { me: string }) | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("copyright_review_open", { p_token: token });
  if (error) {
    throw new Error("Could not open the request", { cause: error.code });
  }
  const parsed = detailSchema.extend({ me: z.string() }).safeParse(data);
  return parsed.success ? parsed.data : null;
}

export async function outsideReviewDecide(input: {
  token: string;
  approve: boolean;
  note: string;
}): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("copyright_review_decide", {
    p_token: input.token,
    p_approve: input.approve,
    p_note: input.note,
  });
  return actionResult(error);
}

/** The requests sent to the signed-in Academy reviewer. */
export async function getMyReviews(): Promise<RequestRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("copyright_my_reviews");
  if (error) {
    throw new Error("Could not load your requests", { cause: error.code });
  }
  const parsed = z.array(rowSchema).safeParse(data);
  return parsed.success ? parsed.data : [];
}

/** How many requests wait for the signed-in person; 0 for anyone without the permission. */
export async function getMyReviewCount(): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("copyright_my_review_count");
  return error ? 0 : (data ?? 0);
}

export async function openMyReview(requestId: string): Promise<RequestDetail | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("copyright_member_open", { p_request: requestId });
  if (error) {
    return null;
  }
  const parsed = detailSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

export async function memberReviewDecide(input: {
  requestId: string;
  approve: boolean;
  note: string;
}): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("copyright_member_decide", {
    p_request: input.requestId,
    p_approve: input.approve,
    p_note: input.note,
  });
  return actionResult(error);
}

export type FileAccess =
  | { via: "quality_control"; token: string; requestId: string }
  | { via: "review"; token: string }
  | { via: "member"; requestId: string };

/** A one-minute link to a request's graphic, if the caller may see it; otherwise null. */
export async function fileLinkFor(access: FileAccess): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } =
    access.via === "quality_control"
      ? await supabase.rpc("copyright_qc_file", {
          p_token: access.token,
          p_request: access.requestId,
        })
      : access.via === "review"
        ? await supabase.rpc("copyright_review_file", { p_token: access.token })
        : await supabase.rpc("copyright_member_file", { p_request: access.requestId });
  if (error || !data) {
    return null;
  }
  return signedFileUrl(data);
}
