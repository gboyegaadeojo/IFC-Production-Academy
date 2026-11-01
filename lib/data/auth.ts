import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/data/supabase/server";
import type { EmailOtpType } from "@/lib/domain/auth";
import { publicEnv } from "@/lib/env";

export type AccountStatus = "active" | "suspended" | "deactivated";

export type CurrentUser = {
  id: string;
  displayName: string;
  status: AccountStatus;
  /** The sign-in email, from the session. */
  email: string | null;
};

/** The signed-in person, or null. Read once per request. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createSupabaseServerClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims.sub;
  if (claimsError || !userId) {
    return null;
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, display_name, status")
    .eq("id", userId)
    .maybeSingle();
  if (error || !profile) {
    return null;
  }
  const email = claimsData?.claims.email;
  return {
    id: profile.id,
    displayName: profile.display_name,
    status: profile.status,
    email: typeof email === "string" ? email : null,
  };
});

/** For protected pages: sends signed-out visitors to sign-in and inactive accounts to an explanation. */
export async function requireActiveUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/sign-in");
  }
  if (user.status !== "active") {
    redirect("/sign-in?error=account_inactive");
  }
  return user;
}

export type AuthResult = { ok: true } | { ok: false };

/**
 * Sends a magic link, the only way to sign in (SRS-AUTH-002). Our email template builds the link itself: it opens
 * /auth/confirm with a token hash and lands on /home. Supabase's default template (used until
 * custom SMTP is set up) ignores that and sends people to emailRedirectTo with a PKCE code.
 */
export async function sendMagicLink(email: string): Promise<AuthResult> {
  const supabase = await createSupabaseServerClient();
  const emailRedirectTo = new URL("/auth/callback", publicEnv().NEXT_PUBLIC_SITE_URL);
  emailRedirectTo.searchParams.set("next", "/home");
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true, emailRedirectTo: emailRedirectTo.toString() },
  });
  return error ? { ok: false } : { ok: true };
}

/** Completes an email link sent with Supabase's default template (PKCE code). */
export async function exchangeAuthCode(code: string): Promise<AuthResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  return error ? { ok: false } : { ok: true };
}

export async function verifyEmailLink(tokenHash: string, type: EmailOtpType): Promise<AuthResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
  return error ? { ok: false } : { ok: true };
}

/** Ends the session on this device and revokes its refresh token (SRS-AUTH-005). */
export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut({ scope: "local" });
}
