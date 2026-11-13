/**
 * Sign-in emails written by the Academy (decision 2026-11-05): Supabase's Send Email hook hands us
 * the one-time token, and we send the email through Resend in the same Calm design as every other
 * email. Pure rules: checking the hook's signature, and building the email.
 */
import { calmEmailHtml } from "./email-design.ts";

const TOLERANCE_SECONDS = 5 * 60;

function base64ToBytes(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function bytesToBase64(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)));
}

function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let difference = 0;
  for (let i = 0; i < a.length; i += 1) {
    difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return difference === 0;
}

/**
 * Whether a call really came from Supabase (the Standard Webhooks scheme it uses): an HMAC of the
 * message id, time, and body with the shared secret, sent recently. The secret looks like
 * "v1,whsec_<base64>".
 */
export async function verifyHookSignature(input: {
  secret: string;
  id: string | null;
  timestamp: string | null;
  signatures: string | null;
  body: string;
  nowSeconds: number;
}): Promise<boolean> {
  const { secret, id, timestamp, signatures, body, nowSeconds } = input;
  const keyText = secret.replace(/^v1,/, "").replace(/^whsec_/, "");
  if (!keyText || !id || !timestamp || !signatures || !/^\d+$/.test(timestamp)) {
    return false;
  }
  if (Math.abs(nowSeconds - Number(timestamp)) > TOLERANCE_SECONDS) {
    return false;
  }
  let keyBytes: Uint8Array<ArrayBuffer>;
  try {
    keyBytes = base64ToBytes(keyText);
  } catch {
    return false;
  }
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const expected = bytesToBase64(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${timestamp}.${body}`)),
  );
  return signatures
    .split(" ")
    .map((entry) => entry.split(",")[1] ?? "")
    .some((signature) => sameText(signature, expected));
}

type ActionType = "magiclink" | "signup" | "invite";

const COPY: Record<
  ActionType,
  { subject: string; title: string; body: string; button: string; linkType: string }
> = {
  magiclink: {
    subject: "Your sign-in link",
    title: "Here's your sign-in link",
    body: "Tap the button to sign in. The link works once and expires in an hour.",
    button: "Sign in",
    linkType: "email",
  },
  signup: {
    subject: "Your sign-in link",
    title: "Here's your sign-in link",
    body: "Tap the button to sign in. The link works once and expires in an hour.",
    button: "Sign in",
    linkType: "email",
  },
  invite: {
    subject: "You're invited to the Academy",
    title: "You're invited",
    body: "Tap the button to join. The link works once.",
    button: "Accept the invitation",
    linkType: "invite",
  },
};

export function isSupportedAction(value: string): value is ActionType {
  return Object.hasOwn(COPY, value);
}

/** The sign-in email in the Calm design. The link lands on /auth/confirm, as before. */
export function signInEmail(
  input: { action: ActionType; tokenHash: string; siteUrl: string },
  appName = "IFC Production Academy",
  accent?: string,
): { subject: string; text: string; html: string } {
  const copy = COPY[input.action];
  const site = input.siteUrl.replace(/\/+$/, "");
  const url = `${site}/auth/confirm?${new URLSearchParams({
    token_hash: input.tokenHash,
    type: copy.linkType,
    next: "/home",
  })}`;
  const footer =
    "If you didn't ask for this, you can ignore this email. Nobody can sign in without the link.";
  return {
    subject: copy.subject,
    text: [copy.title, "", copy.body, "", `${copy.button}: ${url}`, "", footer, appName].join("\n"),
    html: calmEmailHtml({
      preheader: copy.body,
      title: copy.title,
      paragraphs: [copy.body],
      button: { label: copy.button, url },
      iconUrl: `${site}/brand/icon`,
      footer: { text: footer },
      appName,
      accent,
    }),
  };
}
