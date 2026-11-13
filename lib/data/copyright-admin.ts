import "server-only";
import { z } from "zod";
import { detailSchema, type RequestDetail } from "@/lib/data/copyright";
import { createSupabaseServerClient } from "@/lib/data/supabase/server";
import {
  DEADLINE_COUNTING,
  LATE_POLICIES,
  REQUEST_KINDS,
  REQUEST_STATUSES,
  templatesFrom,
  type DeadlineCounting,
  type EmailTemplate,
  type LatePolicy,
  type TemplateKey,
} from "@/lib/domain/copyright";

// Admin → Copyright (ADD-COPY-09). The database checks copyright.manage on every call and writes the
// audit events; these read its answers with zod and pass values on.

const overviewSchema = z.object({
  on: z.boolean(),
  settings: z.object({
    deadlineDays: z.number().int(),
    deadlineCounting: z.enum(DEADLINE_COUNTING),
    latePolicy: z.enum(LATE_POLICIES),
    introText: z.string(),
    mediaInboxEmail: z.string().nullable(),
    mediaInboxOn: z.boolean(),
    emailOnDuty: z.boolean(),
    checks: z.array(z.string()).catch([]),
    templates: z.unknown(),
  }),
  contacts: z.array(
    z.object({
      id: z.string(),
      kind: z.enum(["quality_control", "reviewer"]),
      name: z.string(),
      email: z.string(),
    }),
  ),
  members: z.array(z.object({ id: z.string(), name: z.string() })),
  requests: z.array(
    z.object({
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
    }),
  ),
});

export type CopyrightAdmin = Omit<z.infer<typeof overviewSchema>, "settings"> & {
  settings: Omit<z.infer<typeof overviewSchema>["settings"], "templates"> & {
    templates: Record<TemplateKey, EmailTemplate>;
    savedTemplates: TemplateKey[];
  };
};

/** Everything Admin → Copyright shows; null for someone without copyright.manage. */
export async function getCopyrightAdmin(): Promise<CopyrightAdmin | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("copyright_admin_overview");
  if (error) {
    if (error.code === "42501") {
      return null;
    }
    throw new Error("Could not load approvals", { cause: error.code });
  }
  const parsed = overviewSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error("Approvals came back in an unexpected shape");
  }
  const saved =
    typeof parsed.data.settings.templates === "object" && parsed.data.settings.templates !== null
      ? (Object.keys(parsed.data.settings.templates) as TemplateKey[])
      : [];
  return {
    ...parsed.data,
    settings: {
      ...parsed.data.settings,
      templates: templatesFrom(parsed.data.settings.templates),
      savedTemplates: saved,
    },
  };
}

export type AdminResult = { ok: true } | { ok: false; error: string };

const ERRORS: Record<string, string> = {
  not_authorized: "This isn't open to you.",
  invalid_settings:
    "Check the settings: the deadline is 0 to 60 days, and the email must be valid.",
  invalid_template: "An email needs a subject (up to 200 characters) and a message.",
  unknown_template: "That email doesn't exist.",
  already_listed: "They're already on that list.",
  invalid_contact: "Enter a name and a valid email address.",
  too_many_tests: "That's 10 tests in an hour. Try again later.",
};

function result(error: { message?: string } | null): AdminResult {
  return error
    ? { ok: false, error: ERRORS[error.message ?? ""] ?? "That didn't save. Try again." }
    : { ok: true };
}

export async function saveCopyrightSettings(input: {
  deadlineDays: number;
  deadlineCounting: DeadlineCounting;
  latePolicy: LatePolicy;
  introText: string;
  mediaInboxEmail: string;
  mediaInboxOn: boolean;
  emailOnDuty: boolean;
  checks: string[];
}): Promise<AdminResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("save_copyright_settings", {
    p_deadline_days: input.deadlineDays,
    p_deadline_counting: input.deadlineCounting,
    p_late_policy: input.latePolicy,
    p_intro_text: input.introText,
    p_media_inbox_email: input.mediaInboxEmail || null,
    p_media_inbox_on: input.mediaInboxOn,
    p_email_on_duty: input.emailOnDuty,
    p_checks: input.checks,
  });
  return result(error);
}

/** Saves an email, or with null puts back the original. */
export async function saveCopyrightTemplate(
  key: TemplateKey,
  template: EmailTemplate | null,
): Promise<AdminResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("save_copyright_template", {
    p_key: key,
    p_subject: template?.subject ?? null,
    p_body: template?.body ?? null,
  });
  return result(error);
}

export async function sendCopyrightTestEmail(key: TemplateKey): Promise<AdminResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("send_copyright_test_email", { p_key: key });
  return result(error);
}

export async function addCopyrightContact(input: {
  kind: "quality_control" | "reviewer";
  name: string;
  email: string;
}): Promise<AdminResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("add_copyright_contact", {
    p_kind: input.kind,
    p_name: input.name,
    p_email: input.email,
  });
  return result(error);
}

export async function removeCopyrightContact(id: string): Promise<AdminResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("remove_copyright_contact", { p_id: id });
  return result(error);
}

/** One request and who it was sent to, for admins; null if it isn't theirs to see. */
export async function getCopyrightAdminRequest(
  requestId: string,
): Promise<(RequestDetail & { reviewers: string[] }) | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("copyright_admin_request", { p_request: requestId });
  if (error) {
    return null;
  }
  const parsed = detailSchema
    .extend({
      reviewers: z
        .array(z.string().nullable())
        .transform((names) => names.filter((name): name is string => name !== null)),
    })
    .safeParse(data);
  return parsed.success ? parsed.data : null;
}
