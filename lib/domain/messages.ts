/**
 * Team messaging rules (ADD-MSG-01 to 03, 07; docs/decisions/2026-11-08-team-messaging.md). Pure
 * functions for the Messages screens: what a chat list row says, unread totals, how messages are
 * grouped and dated. The database decides who reads and writes what.
 */
import { z } from "zod";
import { attachmentPreview, type ChatAttachment } from "./chat-files";

export type ConversationKind = "department" | "group" | "direct";

export type ConversationSummary = {
  id: string;
  kind: ConversationKind;
  title: string;
  departmentHue: string | null;
  departmentIcon: string | null;
  everyone: boolean;
  lastMessageAt: string | null;
  lastBody: string | null;
  lastSenderName: string | null;
  lastMine: boolean;
  lastDeleted: boolean;
  /** What the last message carried, if anything: "photo", "document" or "gif". */
  lastAttachmentKind?: string | null;
  lastAttachmentCount?: number;
  unread: number;
  muted: boolean;
};

export type ConversationDetails = {
  id: string;
  kind: ConversationKind;
  title: string;
  departmentHue: string | null;
  departmentIcon: string | null;
  everyone: boolean;
  memberCount: number;
  canModerate: boolean;
  canRename: boolean;
  muted: boolean;
};

export type ChatMessage = {
  id: string;
  senderId: string | null;
  senderName: string;
  senderIsLeader: boolean;
  body: string | null;
  replyTo: { senderName: string; body: string | null } | null;
  createdAt: string;
  deletedAt: string | null;
  deletedByOther: boolean;
  attachments?: ChatAttachment[];
};

/** Someone in a chat, for its people panel. */
export type ChatPerson = { userId: string; name: string; isLeader: boolean };

export type MessagingPerson = {
  userId: string;
  name: string;
  departmentName: string | null;
  departmentHue: string | null;
};

export function isConversationKind(value: string): value is ConversationKind {
  return value === "department" || value === "group" || value === "direct";
}

export const MESSAGE_MAX_LENGTH = 4000;

export const messageBodySchema = z
  .string()
  .transform((text) => text.trim())
  .pipe(z.string().min(1).max(MESSAGE_MAX_LENGTH));

export const groupTitleSchema = z
  .string()
  .transform((text) => text.trim())
  .pipe(z.string().min(1).max(60));

/** The line under a chat's name in the list. */
export function conversationPreview(chat: ConversationSummary): string {
  if (!chat.lastMessageAt) {
    return "No messages yet";
  }
  if (chat.lastDeleted) {
    return "Message deleted";
  }
  const who = chat.lastMine
    ? "You"
    : chat.kind === "direct"
      ? null
      : firstName(chat.lastSenderName);
  const text =
    (chat.lastBody ?? "").replace(/\s+/g, " ").trim() ||
    attachmentPreview(chat.lastAttachmentKind ?? null, chat.lastAttachmentCount ?? 0) ||
    "";
  return who ? `${who}: ${text}` : text;
}

function firstName(name: string | null): string | null {
  return name ? (name.trim().split(/\s+/)[0] ?? null) : null;
}

/** Unread messages across chats that aren't muted, for the badge on Messages. */
export function unreadTotal(
  chats: readonly Pick<ConversationSummary, "unread" | "muted">[],
): number {
  return chats.reduce((total, chat) => total + (chat.muted ? 0 : chat.unread), 0);
}

/** "99+" past 99, so the badge stays small. */
export function badgeLabel(count: number): string {
  return count > 99 ? "99+" : String(count);
}

const TIME = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Winnipeg",
  hour: "numeric",
  minute: "2-digit",
});
const DAY_KEY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Winnipeg",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const WEEKDAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Winnipeg",
  weekday: "short",
});
const SHORT_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Winnipeg",
  month: "short",
  day: "numeric",
});
const LONG_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Winnipeg",
  weekday: "long",
  month: "long",
  day: "numeric",
});

/** "9:33 a.m." in Winnipeg time. */
export function messageTime(iso: string): string {
  return TIME.format(new Date(iso));
}

/** The list's time: today's time, "Yesterday", a weekday this week, or a short date. */
export function listTime(iso: string, now: Date): string {
  const then = new Date(iso);
  if (DAY_KEY.format(then) === DAY_KEY.format(now)) {
    return messageTime(iso);
  }
  if (DAY_KEY.format(then) === DAY_KEY.format(new Date(now.getTime() - 86_400_000))) {
    return "Yesterday";
  }
  return now.getTime() - then.getTime() < 6 * 86_400_000
    ? WEEKDAY.format(then)
    : SHORT_DATE.format(then);
}

/** The divider above a day's messages. */
export function dayLabel(iso: string, now: Date): string {
  const then = new Date(iso);
  if (DAY_KEY.format(then) === DAY_KEY.format(now)) {
    return "Today";
  }
  if (DAY_KEY.format(then) === DAY_KEY.format(new Date(now.getTime() - 86_400_000))) {
    return "Yesterday";
  }
  return LONG_DAY.format(then);
}

export type ThreadItem =
  | { type: "day"; key: string; label: string }
  | { type: "message"; key: string; message: ChatMessage; mine: boolean; startsGroup: boolean };

/**
 * Messages with day dividers. A message starts a new group, with the sender's name, unless the same
 * person sent the one before within five minutes on the same day.
 */
export function threadItems(messages: readonly ChatMessage[], me: string, now: Date): ThreadItem[] {
  const items: ThreadItem[] = [];
  let previous: ChatMessage | null = null;
  for (const message of messages) {
    const day = DAY_KEY.format(new Date(message.createdAt));
    const newDay = !previous || DAY_KEY.format(new Date(previous.createdAt)) !== day;
    if (newDay) {
      items.push({ type: "day", key: `day-${day}`, label: dayLabel(message.createdAt, now) });
    }
    const startsGroup =
      newDay ||
      !previous ||
      previous.senderId !== message.senderId ||
      new Date(message.createdAt).getTime() - new Date(previous.createdAt).getTime() > 5 * 60_000;
    items.push({
      type: "message",
      key: message.id,
      message,
      mine: message.senderId === me,
      startsGroup,
    });
    previous = message;
  }
  return items;
}

/** What a deleted message says in its place. */
export function deletedText(message: ChatMessage, mine: boolean): string {
  if (message.deletedByOther) {
    return "Message deleted by a leader";
  }
  return mine ? "You deleted this message" : "Message deleted";
}

/** Adds or replaces messages by id, keeping them oldest first. */
export function mergeMessages(
  current: readonly ChatMessage[],
  incoming: readonly ChatMessage[],
): ChatMessage[] {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) {
    byId.set(message.id, message);
  }
  return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Two letters for an avatar. */
export function avatarInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters =
    parts.length > 1
      ? `${parts[0]?.[0] ?? ""}${parts.at(-1)?.[0] ?? ""}`
      : (parts[0] ?? "?").slice(0, 2);
  return letters.toUpperCase() || "?";
}
