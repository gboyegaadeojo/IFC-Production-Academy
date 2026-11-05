import "server-only";

/**
 * One email through Resend, from the app (sign-in emails; decision 2026-11-05). The key and sender
 * are Cloudflare secrets. Never logs an address or the content.
 */
export async function sendEmail(
  to: string,
  email: { subject: string; text: string; html: string },
): Promise<boolean> {
  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.NOTIFY_FROM?.trim();
  if (!key || !from) {
    return false;
  }
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [to],
        subject: email.subject,
        text: email.text,
        html: email.html,
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
}
