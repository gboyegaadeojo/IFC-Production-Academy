import "server-only";
import { createSupabaseServerClient } from "@/lib/data/supabase/server";
import type { Database } from "@/lib/data/database.types";
import {
  isConversationKind,
  unreadTotal,
  type ChatMessage,
  type ChatPerson,
  type ConversationDetails,
  type ConversationSummary,
  type MessagingPerson,
} from "@/lib/domain/messages";
import type { ChatAttachment, OutgoingAttachment } from "@/lib/domain/chat-files";

// Team messaging (ADD-MSG-01 to 03, 07). The database checks the feature flag, membership, and
// capabilities on every call, and audits deletions; these only shape the results.

type Functions = Database["public"]["Functions"];
type MessageRow = Functions["conversation_messages"]["Returns"][number];

export async function getMyConversations(): Promise<ConversationSummary[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("my_conversations");
  if (error) {
    throw new Error("Could not load chats", { cause: error.code });
  }
  return data.flatMap((row) =>
    isConversationKind(row.kind)
      ? [
          {
            id: row.id,
            kind: row.kind,
            title: row.title,
            departmentHue: row.department_hue,
            departmentIcon: row.department_icon,
            everyone: row.everyone,
            lastMessageAt: row.last_message_at,
            lastBody: row.last_body,
            lastSenderName: row.last_sender_name,
            lastMine: row.last_mine ?? false,
            lastDeleted: row.last_deleted ?? false,
            lastAttachmentKind: row.last_attachment_kind,
            lastAttachmentCount: row.last_attachment_count,
            unread: row.unread_count,
            muted: row.muted,
          },
        ]
      : [],
  );
}

/** Unread messages for the badge. Zero if messaging is off or can't be read. */
export async function getMessagesUnread(): Promise<number> {
  try {
    return unreadTotal(await getMyConversations());
  } catch {
    return 0;
  }
}

export async function getConversation(id: string): Promise<ConversationDetails | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("conversation_details", { p_conversation_id: id });
  const row = error ? undefined : data[0];
  if (!row || !isConversationKind(row.kind)) {
    return null;
  }
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    departmentHue: row.department_hue,
    departmentIcon: row.department_icon,
    everyone: row.everyone,
    memberCount: row.member_count,
    canModerate: row.can_moderate,
    canRename: row.can_rename,
    muted: row.muted,
  };
}

const SIGNED_URL_SECONDS = 60;

type StoredAttachment = {
  id: string;
  kind: string;
  removed: boolean;
  full_path: string | null;
  thumb_path: string | null;
  gif_url: string | null;
  width: number | null;
  height: number | null;
  bytes: number | null;
  file_name: string | null;
  mime_type: string | null;
};

function storedAttachments(value: unknown): StoredAttachment[] {
  return Array.isArray(value) ? (value as StoredAttachment[]) : [];
}

function toAttachment(item: StoredAttachment, links: Map<string, string>): ChatAttachment | null {
  if (item.kind !== "photo" && item.kind !== "document" && item.kind !== "gif") {
    return null;
  }
  return {
    id: item.id,
    kind: item.kind,
    removed: item.removed,
    thumbUrl: item.thumb_path ? (links.get(item.thumb_path) ?? null) : null,
    width: item.width,
    height: item.height,
    fileName: item.file_name,
    mimeType: item.mime_type,
    bytes: item.bytes,
    gifUrl: item.gif_url,
  };
}

function toMessage(row: MessageRow, links: Map<string, string>): ChatMessage {
  return {
    attachments: storedAttachments(row.attachments).flatMap((item) => {
      const attachment = toAttachment(item, links);
      return attachment ? [attachment] : [];
    }),
    id: row.id,
    senderId: row.sender_id,
    senderName: row.sender_name ?? "Someone who left",
    senderIsLeader: row.sender_is_leader,
    body: row.body,
    replyTo: row.reply_to
      ? { senderName: row.reply_sender_name ?? "Someone who left", body: row.reply_body }
      : null,
    createdAt: row.created_at,
    deletedAt: row.deleted_at,
    deletedByOther: row.deleted_at !== null && row.deleted_by_other,
  };
}

/** The latest messages, or those sent or deleted after a time (for live updates). */
export async function getMessages(id: string, after?: string): Promise<ChatMessage[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("conversation_messages", {
    p_conversation_id: id,
    p_after: after ?? null,
  });
  if (error) {
    throw new Error("Could not load messages", { cause: error.code });
  }
  return withThumbnails(supabase, data);
}

/** Thumbnails only; a full photo or a document gets its own link when it's opened. */
async function withThumbnails(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  rows: MessageRow[],
): Promise<ChatMessage[]> {
  const thumbs = rows.flatMap((row) =>
    storedAttachments(row.attachments).flatMap((item) =>
      item.thumb_path ? [item.thumb_path] : [],
    ),
  );
  const links = new Map<string, string>();
  if (thumbs.length > 0) {
    const signed = await supabase.storage
      .from("chat-files")
      .createSignedUrls(thumbs, SIGNED_URL_SECONDS);
    for (const item of signed.data ?? []) {
      if (item.path && item.signedUrl) {
        links.set(item.path, item.signedUrl);
      }
    }
  }
  return rows.map((row) => toMessage(row, links));
}

/** Up to 60 messages before a time, oldest first: "Show earlier messages". */
export async function getEarlierMessages(id: string, before: string): Promise<ChatMessage[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("conversation_messages_before", {
    p_conversation_id: id,
    p_before: before,
  });
  if (error) {
    throw new Error("Could not load messages", { cause: error.code });
  }
  return withThumbnails(supabase, data);
}

/** Who's in a chat: names only, for people who can read it. */
export async function getConversationPeople(id: string): Promise<ChatPerson[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("conversation_people", { p_conversation_id: id });
  if (error) {
    throw new Error("Could not load people", { cause: error.code });
  }
  return data.map((row) => ({
    userId: row.user_id,
    name: row.display_name,
    isLeader: row.is_leader,
  }));
}

/** Adds people to a group of chosen people. Audited by the database. Null if refused. */
export async function addGroupMembers(id: string, userIds: string[]): Promise<number | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("add_group_members", {
    p_conversation_id: id,
    p_user_ids: userIds,
  });
  return error ? null : data;
}

export async function removeGroupMember(id: string, userId: string): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("remove_group_member", {
    p_conversation_id: id,
    p_user_id: userId,
  });
  return !error;
}

export async function leaveGroup(id: string): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("leave_group", { p_conversation_id: id });
  return !error;
}

/**
 * A one-minute link to a full photo, or to download a document, for someone who can read its
 * chat (row-level security decides). Null if it's gone or not theirs.
 */
export async function getAttachmentLink(attachmentId: string): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("message_attachments")
    .select("full_path, file_name, kind, removed_at")
    .eq("id", attachmentId)
    .maybeSingle();
  if (!data?.full_path || data.removed_at) {
    return null;
  }
  const { data: link } = await supabase.storage
    .from("chat-files")
    .createSignedUrl(data.full_path, SIGNED_URL_SECONDS, {
      download: data.kind === "document" ? (data.file_name ?? true) : false,
    });
  return link?.signedUrl ?? null;
}

/** The first bytes of an uploaded file, to check it's what its name says. */
export async function readFirstBytes(path: string): Promise<Uint8Array | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.storage.from("chat-files").createSignedUrl(path, 30);
  if (!data?.signedUrl) {
    return null;
  }
  try {
    const response = await fetch(data.signedUrl, {
      headers: { Range: "bytes=0-1023" },
      signal: AbortSignal.timeout(8000),
    });
    return response.ok ? new Uint8Array(await response.arrayBuffer()).slice(0, 1024) : null;
  } catch {
    return null;
  }
}

export async function getMessagingPeople(): Promise<MessagingPerson[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("messaging_people");
  if (error) {
    throw new Error("Could not load people", { cause: error.code });
  }
  return data.map((row) => ({
    userId: row.user_id,
    name: row.display_name,
    departmentName: row.department_name,
    departmentHue: row.department_hue,
  }));
}

/** Returns the message's id. The same client id never posts twice (SRS-PROG-004). */
export async function sendMessage(
  conversationId: string,
  clientId: string,
  body: string,
  replyTo: string | null,
  attachments: OutgoingAttachment[] = [],
): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("send_message", {
    p_conversation_id: conversationId,
    p_client_id: clientId,
    p_body: body,
    p_reply_to: replyTo,
    p_attachments: attachments,
  });
  return error ? null : data;
}

export async function deleteMessage(messageId: string): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("delete_message", { p_message_id: messageId });
  return !error;
}

export async function markConversationRead(conversationId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.rpc("mark_conversation_read", { p_conversation_id: conversationId });
}

export async function setConversationMuted(
  conversationId: string,
  muted: boolean,
): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_conversation_muted", {
    p_conversation_id: conversationId,
    p_muted: muted,
  });
  return !error;
}

export async function startDirectConversation(userId: string): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("start_direct_conversation", { p_user_id: userId });
  return error ? null : data;
}

export async function createGroupConversation(
  title: string,
  everyone: boolean,
  userIds: string[],
): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("create_group_conversation", {
    p_title: title,
    p_everyone: everyone,
    p_user_ids: userIds,
  });
  return error ? null : data;
}

export async function renameGroupConversation(id: string, title: string): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("rename_group_conversation", {
    p_conversation_id: id,
    p_title: title,
  });
  return !error;
}
