import "server-only";
import { createSupabaseServerClient } from "@/lib/data/supabase/server";
import type { Database } from "@/lib/data/database.types";
import {
  isConversationKind,
  unreadTotal,
  type ChatMessage,
  type ConversationDetails,
  type ConversationSummary,
  type MessagingPerson,
} from "@/lib/domain/messages";

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

function toMessage(row: MessageRow): ChatMessage {
  return {
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
  return data.map(toMessage);
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
): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("send_message", {
    p_conversation_id: conversationId,
    p_client_id: clientId,
    p_body: body,
    p_reply_to: replyTo,
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
