/**
 * Sends pending notification emails through Resend (SRS-NOTIF-001..006). Run by
 * .github/workflows/notifications.yml with Node's built-in TypeScript support.
 *
 * Uses the Supabase service role, which exists only as a GitHub Actions secret: it never reaches
 * the browser or the app's runtime. Logs counts only, never addresses, names, or content
 * (CLAUDE.md "Actions logs must never contain data"). With no Resend key it does nothing.
 */
import { isQuietHours, notificationEmail } from "../lib/domain/notifications.ts";
import { supabaseKeyHeaders } from "../lib/domain/supabase-keys.ts";

type Claimed = { id: string; email: string; title: string; body: string; link: string | null };

const env = (name: string) => process.env[name]?.trim() ?? "";

async function rpc<T>(url: string, key: string, name: string, body: object): Promise<T> {
  const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { ...supabaseKeyHeaders(key), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`${name} failed with HTTP ${response.status}`);
  }
  const text = await response.text();
  return (text ? JSON.parse(text) : null) as T;
}

async function main(): Promise<void> {
  const supabaseUrl = env("SUPABASE_URL").replace(/\/+$/, "");
  const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
  const resendKey = env("RESEND_API_KEY");
  const from = env("NOTIFY_FROM");
  const siteUrl = env("SITE_URL");
  if (!supabaseUrl || !serviceKey || !siteUrl) {
    console.log("Notifications: Supabase or site settings are not configured; nothing to do.");
    return;
  }

  const sopReminders = await rpc<number>(supabaseUrl, serviceKey, "queue_sop_review_reminders", {});
  const reminders = await rpc<number>(supabaseUrl, serviceKey, "queue_reminders", {});
  console.log(`Reminders checked: ${sopReminders + reminders} due.`);
  // Freeze the checklist record of services whose day has ended (checklist app US-07b).
  const frozen = await rpc<number>(supabaseUrl, serviceKey, "freeze_service_checklist_records", {});
  console.log(`Checklist records frozen: ${frozen}.`);
  // Onboarding pathways: waits that have run their time move on (counts only in the log).
  const onboarding = await rpc<number>(supabaseUrl, serviceKey, "run_onboarding", {});
  console.log(`Onboarding entries checked: ${onboarding}.`);

  if (!resendKey || !from) {
    console.log(
      "Email is off: RESEND_API_KEY or NOTIFY_FROM is not set. In-app notifications only.",
    );
    return;
  }

  if (isQuietHours(new Date())) {
    console.log("Quiet hours (20:00 to 08:00 Winnipeg time): emails wait until 08:00.");
    return;
  }

  let sent = 0;
  let failed = 0;
  for (let batch = 0; batch < 10; batch += 1) {
    const claimed = await rpc<Claimed[]>(supabaseUrl, serviceKey, "claim_email_notifications", {
      p_limit: 50,
    });
    if (claimed.length === 0) {
      break;
    }
    for (const item of claimed) {
      const email = notificationEmail(item, siteUrl);
      let ok = false;
      try {
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from,
            to: [item.email],
            subject: email.subject,
            text: email.text,
            html: email.html,
          }),
        });
        ok = response.ok;
      } catch {
        ok = false;
      }
      await rpc(supabaseUrl, serviceKey, "complete_email_notification", {
        p_id: item.id,
        p_sent: ok,
      });
      if (ok) {
        sent += 1;
      } else {
        failed += 1;
      }
    }
  }
  console.log(`Notification emails: ${sent} sent, ${failed} failed.`);
  if (failed > 0 && sent === 0) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  // The message names the step and HTTP status only.
  console.error(error instanceof Error ? error.message : "Notifications failed");
  process.exitCode = 1;
});
