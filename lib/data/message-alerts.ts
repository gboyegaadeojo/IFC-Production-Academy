import "server-only";
import { vapidKeys } from "@/lib/data/push";
import { createSupabaseAdminClient } from "@/lib/data/supabase/admin";
import { messageAlert } from "@/lib/domain/message-alerts";
import { sendPush } from "@/lib/domain/web-push";

/**
 * Instant phone alerts for a message that's just been sent (ADD-MSG-06; G, 2026-11-09). Runs in the
 * Worker after the reply has gone back (next/server `after`, which uses waitUntil), so sending is
 * never slower. The database chooses who's alerted and records it first (claim_message_alerts), so
 * a retry never buzzes twice. Uses the service role, a Cloudflare secret. Logs counts only.
 */
export async function sendMessageAlerts(messageId: string): Promise<void> {
  const vapid = vapidKeys();
  const admin = createSupabaseAdminClient();
  if (!vapid || !admin) {
    return;
  }
  const { data, error } = await admin.rpc("claim_message_alerts", { p_message_id: messageId });
  if (error || data.length === 0) {
    return;
  }
  const counts = { sent: 0, gone: 0, failed: 0 };
  await Promise.all(
    data.map(async (row) => {
      const outcome = await sendPush(
        row,
        messageAlert({
          conversationId: row.conversation_id,
          kind: row.kind,
          chatName: row.chat_name,
          senderName: row.sender_name,
          preview: row.preview,
          attachmentKind: row.attachment_kind,
          unreadCount: row.unread_count,
        }),
        vapid,
      );
      counts[outcome] += 1;
      if (outcome === "gone") {
        await admin.rpc("message_alert_device_gone", { p_endpoint: row.endpoint });
      }
    }),
  );
  console.log(
    `Message alerts: ${counts.sent} sent, ${counts.gone} devices gone, ${counts.failed} failed.`,
  );
}
