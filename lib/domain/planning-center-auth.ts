// Sign in with Planning Center (checklist app US-01): the OAuth 2.0 authorization-code exchange,
// done on the server. Planning Center vouches for who someone is; the database decides whether
// they're one of IFC's people (planning_center_sign_in).

import { z } from "zod";

export const PCO_API = "https://api.planningcenteronline.com";
export const PCO_AUTHORIZE_URL = `${PCO_API}/oauth/authorize`;
export const PCO_TOKEN_URL = `${PCO_API}/oauth/token`;
/** People is enough to read who they are, their emails, and their organization. */
export const PCO_SCOPE = "people";

/** A one-time value tying the callback to this browser, kept in an httpOnly cookie. */
export const PCO_STATE_COOKIE = "pco_oauth";
export const PCO_STATE_MAX_AGE = 10 * 60;
export const PCO_CALLBACK_PATH = "/auth/planning-center/callback";

export function pcoAuthorizeUrl(clientId: string, redirectUri: string, state: string): string {
  const url = new URL(PCO_AUTHORIZE_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", PCO_SCOPE);
  url.searchParams.set("state", state);
  return url.toString();
}

/** The cookie holds the state and where to go afterwards: "state.next". */
export function packState(state: string, next: string): string {
  return `${state}.${encodeURIComponent(next)}`;
}

export function unpackState(value: string | undefined): { state: string; next: string } | null {
  if (!value) {
    return null;
  }
  const dot = value.indexOf(".");
  if (dot < 32) {
    return null;
  }
  try {
    return { state: value.slice(0, dot), next: decodeURIComponent(value.slice(dot + 1)) };
  } catch {
    return null;
  }
}

/** Compares without stopping at the first difference. */
export function sameState(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let difference = 0;
  for (let i = 0; i < a.length; i += 1) {
    difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return difference === 0;
}

export const pcoCallbackSchema = z.object({
  code: z.string().min(1).max(512),
  state: z.string().min(32).max(128),
});

export const pcoTokenSchema = z.object({ access_token: z.string().min(1) });

const resource = z.object({
  id: z.string().min(1),
  type: z.string(),
  attributes: z.record(z.string(), z.unknown()).default({}),
});

export const pcoMeSchema = z.object({
  data: resource,
  included: z.array(resource).default([]),
});

export const pcoOrganizationSchema = z.object({ data: resource });

export type PcoIdentity = { personId: string; name: string; emails: string[] };

/** Who Planning Center says they are, with their email addresses, primary first. */
export function pcoIdentity(me: z.infer<typeof pcoMeSchema>): PcoIdentity {
  const emails = me.included
    .filter((item) => item.type === "Email")
    .map((item) => ({
      address: typeof item.attributes.address === "string" ? item.attributes.address.trim() : "",
      primary: item.attributes.primary === true,
    }))
    .filter((email) => z.email().safeParse(email.address).success)
    .sort((a, b) => Number(b.primary) - Number(a.primary))
    .map((email) => email.address.toLowerCase());
  const attributes = me.data.attributes;
  const name =
    (typeof attributes.name === "string" && attributes.name.trim()) ||
    [attributes.first_name, attributes.last_name]
      .filter((part): part is string => typeof part === "string" && part.trim() !== "")
      .join(" ");
  return { personId: me.data.id, name: name.slice(0, 120), emails: [...new Set(emails)] };
}
