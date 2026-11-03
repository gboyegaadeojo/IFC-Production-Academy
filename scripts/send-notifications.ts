/**
 * Sends pending notification emails through Resend (SRS-NOTIF-001..006). Run by
 * .github/workflows/notifications.yml with Node's built-in TypeScript support.
 *
 * Uses the Supabase service role, which exists only as a GitHub Actions secret: it never reaches
 * the browser or the app's runtime. Logs counts only, never addresses, names, or content
 * (CLAUDE.md "Actions logs must never contain data"). With no Resend key it does nothing.
 */
import { isQuietHours, notificationEmail, onboardingEmail } from "../lib/domain/notifications.ts";
import { supabaseKeyHeaders } from "../lib/domain/supabase-keys.ts";
import { pushMessageFor, sendPush } from "../lib/domain/web-push.ts";

type ClaimedPush = {
  notification_id: string;
  title: string;
  body: string;
  link: string | null;
  endpoint: string;
  p256dh: string;
  auth: string;
  token: string;
};

/**
 * Device alerts the app didn't send straight away (supabase/migrations/20261210120000_push_alerts.sql).
 * Not held for quiet hours: phones have their own Do Not Disturb. Logs counts only.
 */
async function sendPendingPush(supabaseUrl: string, serviceKey: string, siteUrl: string) {
  const publicKey = env("VAPID_PUBLIC_KEY");
  const privateKey = env("VAPID_PRIVATE_KEY");
  if (!publicKey || !privateKey) {
    console.log("Device alerts are off: the VAPID keys are not set.");
    return;
  }
  const vapid = { publicKey, privateKey, subject: siteUrl };
  const claimed = await rpc<ClaimedPush[]>(supabaseUrl, serviceKey, "claim_push_batch", {
    p_limit: 200,
  });
  const counts = { sent: 0, gone: 0, failed: 0 };
  for (const item of claimed) {
    const outcome = await sendPush(
      item,
      pushMessageFor({
        id: item.notification_id,
        title: item.title,
        body: item.body,
        link: item.link,
      }),
      vapid,
    );
    counts[outcome] += 1;
    if (outcome === "gone") {
      await rpc(supabaseUrl, serviceKey, "push_subscription_gone", {
        p_endpoint: item.endpoint,
        p_token: item.token,
      });
    }
  }
  console.log(
    `Device alerts: ${counts.sent} sent, ${counts.gone} devices gone, ${counts.failed} failed.`,
  );
}

type Claimed = { id: string; email: string; title: string; body: string; link: string | null };
type ClaimedOnboarding = {
  id: string;
  email: string;
  subject: string;
  body: string;
  has_account: boolean;
};

const env = (name: string) => process.env[name]?.trim() ?? "";

/** Resend allows 2 requests a second on its free plan. */
const SEND_GAP_MS = 600;
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * What Resend said. "limit" means its daily or per-second limit: the email is fine and goes back in
 * the queue for a later run. Never throws, so one bad send doesn't stop the batch.
 */
async function sendEmail(
  resendKey: string,
  from: string,
  to: string,
  email: { subject: string; text: string; html: string },
): Promise<"sent" | "failed" | "limit"> {
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [to],
        subject: email.subject,
        text: email.text,
        html: email.html,
      }),
    });
    return response.ok ? "sent" : response.status === 429 ? "limit" : "failed";
  } catch {
    return "failed";
  }
}

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
  await sendPendingPush(supabaseUrl, serviceKey, siteUrl);

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

  // The app's name for email subjects (ADD-DASH-04). Falls back to the original if this can't be read.
  const appName = await rpc<{ app_name: string }[]>(supabaseUrl, serviceKey, "app_branding", {})
    .then((rows) => rows[0]?.app_name)
    .catch(() => undefined);

  let sent = 0;
  let failed = 0;
  // Once Resend says it's at its limit, everything else waits for a later run.
  let held = false;
  for (let batch = 0; batch < 10 && !held; batch += 1) {
    const claimed = await rpc<Claimed[]>(supabaseUrl, serviceKey, "claim_email_notifications", {
      p_limit: 50,
    });
    if (claimed.length === 0) {
      break;
    }
    for (const item of claimed) {
      if (held) {
        await rpc(supabaseUrl, serviceKey, "release_email_notification", { p_id: item.id });
        continue;
      }
      const email = notificationEmail(item, siteUrl, appName);
      const result = await sendEmail(resendKey, from, item.email, email);
      await pause(SEND_GAP_MS);
      if (result === "limit") {
        held = true;
        await rpc(supabaseUrl, serviceKey, "release_email_notification", { p_id: item.id });
        continue;
      }
      const ok = result === "sent";
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
  console.log(
    `Notification emails: ${sent} sent, ${failed} failed${held ? ", rest held by the limit" : ""}.`,
  );
  if (failed > 0) {
    process.exitCode = 1;
  }

  // Onboarding pathway emails. The database only hands these over once they're switched on at launch.
  let onboardingSent = 0;
  let onboardingFailed = 0;
  for (let batch = 0; batch < 10 && !held; batch += 1) {
    const claimed = await rpc<ClaimedOnboarding[]>(
      supabaseUrl,
      serviceKey,
      "claim_onboarding_emails",
      { p_limit: 50 },
    );
    if (claimed.length === 0) {
      break;
    }
    for (const item of claimed) {
      if (held) {
        await rpc(supabaseUrl, serviceKey, "release_onboarding_email", { p_id: item.id });
        continue;
      }
      const email = onboardingEmail(
        { subject: item.subject, body: item.body, hasAccount: item.has_account },
        siteUrl,
        appName,
      );
      const result = await sendEmail(resendKey, from, item.email, email);
      await pause(SEND_GAP_MS);
      if (result === "limit") {
        held = true;
        await rpc(supabaseUrl, serviceKey, "release_onboarding_email", { p_id: item.id });
        continue;
      }
      const ok = result === "sent";
      await rpc(supabaseUrl, serviceKey, "complete_onboarding_email", {
        p_id: item.id,
        p_sent: ok,
      });
      if (ok) {
        onboardingSent += 1;
      } else {
        onboardingFailed += 1;
      }
    }
  }
  console.log(`Onboarding emails: ${onboardingSent} sent, ${onboardingFailed} failed.`);
  if (onboardingFailed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  // The message names the step and HTTP status only.
  console.error(error instanceof Error ? error.message : "Notifications failed");
  process.exitCode = 1;
});
