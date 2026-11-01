import "server-only";
import { createSupabaseAdminClient } from "@/lib/data/supabase/admin";
import { createSupabaseServerClient } from "@/lib/data/supabase/server";
import type { SignInError } from "@/lib/domain/auth";
import {
  PCO_API,
  PCO_TOKEN_URL,
  pcoIdentity,
  pcoMeSchema,
  pcoOrganizationSchema,
  pcoTokenSchema,
  type PcoIdentity,
} from "@/lib/domain/planning-center-auth";

// Sign in with Planning Center (checklist app US-01, US-03a). Planning Center's OAuth app
// credentials and the service-role key are Cloudflare secrets; nothing here logs a token, an
// email, or a name.

type PcoAuthConfig = { clientId: string; clientSecret: string };

export function pcoAuthConfig(): PcoAuthConfig | null {
  const clientId = process.env.PCO_CLIENT_ID;
  const clientSecret = process.env.PCO_CLIENT_SECRET;
  return clientId && clientSecret && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? { clientId, clientSecret }
    : null;
}

export function pcoSignInEnabled(): boolean {
  return pcoAuthConfig() !== null;
}

async function pcoJson(url: string, init: RequestInit): Promise<unknown> {
  try {
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

/** Swaps the one-time code for an access token, used once and then dropped. */
export async function exchangePcoCode(
  config: PcoAuthConfig,
  code: string,
  redirectUri: string,
): Promise<string | null> {
  const body = await pcoJson(PCO_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: redirectUri,
    }),
  });
  const parsed = pcoTokenSchema.safeParse(body);
  return parsed.success ? parsed.data.access_token : null;
}

/** Who the token belongs to, and which Planning Center organization they're in. */
export async function readPcoIdentity(
  accessToken: string,
): Promise<{ identity: PcoIdentity; organizationId: string } | null> {
  const init = {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  };
  const [me, organization] = await Promise.all([
    pcoJson(`${PCO_API}/people/v2/me?include=emails`, init),
    pcoJson(`${PCO_API}/people/v2`, init),
  ]);
  const parsedMe = pcoMeSchema.safeParse(me);
  const parsedOrganization = pcoOrganizationSchema.safeParse(organization);
  return parsedMe.success && parsedOrganization.success
    ? { identity: pcoIdentity(parsedMe.data), organizationId: parsedOrganization.data.data.id }
    : null;
}

/**
 * Signs this browser in as the Planning Center person's Academy account, creating the account
 * quietly (no email) the first time. The database decides whether they're one of IFC's people.
 */
export async function signInAsPcoPerson(
  identity: PcoIdentity,
  organizationId: string,
): Promise<{ ok: true } | { ok: false; error: SignInError }> {
  const admin = createSupabaseAdminClient();
  if (!admin) {
    return { ok: false, error: "pco_failed" };
  }
  const lookUp = () =>
    admin.rpc("planning_center_sign_in", {
      p_pco_person_id: identity.personId,
      p_pco_organization_id: organizationId,
      p_emails: identity.emails,
    });

  let result = await lookUp();
  if (result.error) {
    return {
      ok: false,
      error: /wrong_organization|not_in_planning_center/.test(result.error.message)
        ? "pco_not_on_team"
        : "pco_failed",
    };
  }
  if (result.data.length === 0) {
    const email = identity.emails[0];
    if (!email) {
      return { ok: false, error: "pco_no_email" };
    }
    const created = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { full_name: identity.name },
    });
    if (created.error) {
      return { ok: false, error: "pco_failed" };
    }
    result = await lookUp();
  }
  const account = result.data?.[0];
  if (result.error || !account?.email) {
    return { ok: false, error: "pco_failed" };
  }

  // A one-time sign-in token for that account, used straight away on this server: no email.
  const link = await admin.auth.admin.generateLink({ type: "magiclink", email: account.email });
  const tokenHash = link.data?.properties?.hashed_token;
  if (link.error || !tokenHash) {
    return { ok: false, error: "pco_failed" };
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });
  return error ? { ok: false, error: "pco_failed" } : { ok: true };
}
