import { z } from "zod";
import { sendEmail } from "@/lib/data/email";
import { isSupportedAction, signInEmail, verifyHookSignature } from "@/lib/domain/auth-email";
import { publicEnv } from "@/lib/env";

const Payload = z.object({
  user: z.object({ email: z.email() }),
  email_data: z.object({
    token_hash: z.string().min(1).max(512),
    email_action_type: z.string().max(40),
  }),
});

function failure(status: number, message: string) {
  return Response.json({ error: { http_code: status, message } }, { status });
}

/**
 * Supabase's Send Email hook (decision 2026-11-05): Supabase makes the one-time token and calls
 * here, and the Academy sends the email through Resend in its own design. Signed by Supabase with
 * a shared secret. Nothing is logged: no addresses, no tokens.
 */
export async function POST(request: Request) {
  const secret = process.env.SEND_EMAIL_HOOK_SECRET?.trim();
  if (!secret) {
    return failure(503, "Sign-in emails aren't set up yet.");
  }
  const body = await request.text();
  const verified = await verifyHookSignature({
    secret,
    id: request.headers.get("webhook-id"),
    timestamp: request.headers.get("webhook-timestamp"),
    signatures: request.headers.get("webhook-signature"),
    body,
    nowSeconds: Math.floor(Date.now() / 1000),
  });
  if (!verified) {
    return failure(401, "Not from Supabase.");
  }
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return failure(400, "Not readable.");
  }
  const parsed = Payload.safeParse(json);
  if (!parsed.success || !isSupportedAction(parsed.data.email_data.email_action_type)) {
    return failure(400, "This kind of email isn't used by the Academy.");
  }
  const email = signInEmail({
    action: parsed.data.email_data.email_action_type,
    tokenHash: parsed.data.email_data.token_hash,
    siteUrl: publicEnv().NEXT_PUBLIC_SITE_URL,
  });
  const sent = await sendEmail(parsed.data.user.email, email);
  return sent ? Response.json({}) : failure(502, "The email couldn't be sent. Try again.");
}
