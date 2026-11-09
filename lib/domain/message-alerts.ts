/**
 * Instant phone alerts for messages (ADD-MSG-06; G, 2026-11-09). One alert per chat, replaced as
 * more arrive (the same tag), saying how many are waiting. A direct message says only who it's
 * from, never the words. The database decides who gets one (claim_message_alerts).
 */
import { attachmentPreview } from "./chat-files";
import type { PushMessage } from "./web-push";

export type MessageAlertFacts = {
  conversationId: string;
  kind: string;
  chatName: string;
  senderName: string | null;
  /** The start of the message, or null for a direct message. */
  preview: string | null;
  attachmentKind: string | null;
  unreadCount: number;
};

/** One alert's tag per chat, so a new one replaces the last on the device. */
export function messageAlertTag(conversationId: string): string {
  return `chat-${conversationId}`;
}

function plural(count: number, word: string): string {
  return count === 1 ? `1 new ${word}` : `${count} new ${word}s`;
}

export function messageAlert(facts: MessageAlertFacts): PushMessage {
  const count = Math.max(1, facts.unreadCount);
  const sender = facts.senderName?.trim() || "Someone";
  const url = `/messages/${facts.conversationId}`;
  const tag = messageAlertTag(facts.conversationId);
  if (facts.kind === "direct") {
    return {
      title: count === 1 ? `New message from ${sender}` : `${count} new messages from ${sender}`,
      body: `Open Messages to read ${count === 1 ? "it" : "them"}.`,
      url,
      tag,
    };
  }
  const words =
    facts.preview?.replace(/\s+/g, " ").trim() ||
    attachmentPreview(facts.attachmentKind, 1) ||
    "New message";
  return {
    title: `${plural(count, "message")} in ${facts.chatName}`.slice(0, 120),
    body: `${sender.split(/\s+/)[0]}: ${words}`.slice(0, 160),
    url,
    tag,
  };
}
