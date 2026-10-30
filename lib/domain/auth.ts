import { z } from "zod";

export const DEFAULT_SIGNED_IN_PATH = "/home";

/**
 * Where to send someone after sign-in. Only same-site paths are allowed, so a crafted
 * `next` parameter can't bounce a volunteer to another site (open redirect).
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return DEFAULT_SIGNED_IN_PATH;
  }
  // Reject control characters and anything a URL parser would treat as another origin.
  if (/[\u0000-\u001f\\]/.test(next)) {
    return DEFAULT_SIGNED_IN_PATH;
  }
  try {
    const url = new URL(next, "https://academy.invalid");
    if (url.origin !== "https://academy.invalid") {
      return DEFAULT_SIGNED_IN_PATH;
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return DEFAULT_SIGNED_IN_PATH;
  }
}

export const magicLinkRequestSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email({ error: "Enter a valid email address, like name@example.com." }).max(254)),
});

/** Types accepted by Supabase `verifyOtp` with a token hash (SRS-AUTH-002). */
export const emailOtpTypeSchema = z.enum([
  "email",
  "magiclink",
  "signup",
  "invite",
  "recovery",
  "email_change",
]);
export type EmailOtpType = z.infer<typeof emailOtpTypeSchema>;

export const authConfirmParamsSchema = z.object({
  token_hash: z.string().min(1).max(512),
  type: emailOtpTypeSchema,
});

/** Sign-in error codes we put in the URL. Never put provider messages in a URL. */
export const signInErrorSchema = z.enum(["link_invalid", "account_inactive"]);
export type SignInError = z.infer<typeof signInErrorSchema>;

export function signInErrorMessage(code: string | null | undefined): string | null {
  const parsed = signInErrorSchema.safeParse(code);
  if (!parsed.success) {
    return null;
  }
  switch (parsed.data) {
    case "link_invalid":
      return "That sign-in link has expired or was already used. Ask for a new one below.";
    case "account_inactive":
      return "Your account isn't active right now. Talk to your department leader or the Production Director.";
  }
}
