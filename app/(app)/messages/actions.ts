"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/components/ui/action-form";
import { getCurrentUser } from "@/lib/data/auth";
import { searchGifs, type GifSearch } from "@/lib/data/giphy";
import {
  addGroupMembers,
  createGroupConversation,
  deleteMessage,
  getAttachmentLink,
  getConversationPeople,
  getEarlierMessages,
  getMessages,
  leaveGroup,
  removeGroupMember,
  getMessagesUnread,
  markConversationRead,
  readFirstBytes,
  renameGroupConversation,
  sendMessage,
  setConversationMuted,
  startDirectConversation,
} from "@/lib/data/messages";
import {
  documentTypeFor,
  matchesSignature,
  MAX_DOCUMENT_BYTES,
  MAX_PHOTOS,
  type OutgoingAttachment,
} from "@/lib/domain/chat-files";
import {
  groupTitleSchema,
  MESSAGE_MAX_LENGTH,
  type ChatMessage,
  type ChatPerson,
} from "@/lib/domain/messages";

// Team messaging (ADD-MSG-01 to 03, 07). Inputs are checked here; the database checks the feature
// flag, membership, and capabilities, and audits deletions and groups.

const id = z.uuid();

async function active(): Promise<boolean> {
  return (await getCurrentUser())?.status === "active";
}

export type SendResult = { ok: true; messages: ChatMessage[] } | { ok: false; message: string };

const filePath = z.string().regex(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[a-z0-9._-]{1,40}$/);
const side = z.number().int().min(1).max(1600);
const attachmentSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("photo"),
    full_path: filePath,
    thumb_path: filePath,
    width: side,
    height: side,
    bytes: z.number().int().min(1).max(MAX_DOCUMENT_BYTES),
  }),
  z.object({
    kind: z.literal("document"),
    full_path: filePath,
    file_name: z.string().trim().min(1).max(200),
    mime_type: z.string(),
    bytes: z.number().int().min(1).max(MAX_DOCUMENT_BYTES),
  }),
  z.object({
    kind: z.literal("gif"),
    gif_id: z.string().regex(/^[A-Za-z0-9]{1,64}$/),
    gif_url: z.string().regex(/^https:\/\/media[0-9]*\.giphy\.com\//),
    width: side,
    height: side,
  }),
]);

/**
 * Sends, then returns what's new since `after`, including the sent message. Safe to retry. A
 * document's first bytes are checked here as well as in the browser, so a program renamed to .pdf
 * is refused (ADD-MSG-09).
 */
export async function sendMessageAction(input: {
  conversationId: string;
  clientId: string;
  body: string;
  replyTo: string | null;
  after: string | null;
  attachments?: OutgoingAttachment[];
}): Promise<SendResult> {
  const parsed = z
    .object({
      conversationId: id,
      clientId: id,
      body: z.string().max(MESSAGE_MAX_LENGTH * 2),
      replyTo: id.nullable(),
      after: z.iso.datetime({ offset: true }).nullable(),
      attachments: z.array(attachmentSchema).max(MAX_PHOTOS).default([]),
    })
    .safeParse(input);
  const words = parsed.success ? parsed.data.body.trim() : "";
  if (
    !parsed.success ||
    words.length > MESSAGE_MAX_LENGTH ||
    (words.length === 0 && parsed.data.attachments.length === 0)
  ) {
    return { ok: false, message: "Write a message first, up to 4,000 characters." };
  }
  if (!(await active())) {
    return { ok: false, message: "Sign in again to send messages." };
  }
  const { conversationId, clientId, replyTo, after, attachments } = parsed.data;
  for (const attachment of attachments) {
    if (attachment.kind === "document") {
      const type = documentTypeFor(attachment.file_name);
      const bytes = await readFirstBytes(attachment.full_path);
      if (
        !type ||
        type.mime !== attachment.mime_type ||
        !bytes ||
        !matchesSignature(bytes, type.mime)
      ) {
        return {
          ok: false,
          message: "That file couldn't be sent. Share PDF, Word, Excel, PowerPoint or text files.",
        };
      }
    }
  }
  const sent = await sendMessage(conversationId, clientId, words, replyTo, attachments);
  if (!sent) {
    return { ok: false, message: "That didn't send. Check your connection and try again." };
  }
  return { ok: true, messages: await getMessages(conversationId, after ?? undefined) };
}

/** Up to 60 messages before the oldest shown: "Show earlier messages". */
export async function fetchEarlierAction(
  conversationId: string,
  before: string,
): Promise<ChatMessage[]> {
  const parsed = z
    .object({ conversationId: id, before: z.iso.datetime({ offset: true }) })
    .safeParse({ conversationId, before });
  if (!parsed.success || !(await active())) {
    return [];
  }
  try {
    return await getEarlierMessages(parsed.data.conversationId, parsed.data.before);
  } catch {
    return [];
  }
}

/** Who's in a chat, for its people panel. Empty if they can't read it. */
export async function chatPeopleAction(conversationId: string): Promise<ChatPerson[]> {
  if (!id.safeParse(conversationId).success || !(await active())) {
    return [];
  }
  try {
    return await getConversationPeople(conversationId);
  } catch {
    return [];
  }
}

/** Adds people to a group of chosen people (its maker, or a church-wide moderator). Audited. */
export async function addGroupMembersAction(
  conversationId: string,
  userIds: string[],
): Promise<{ ok: boolean; message: string }> {
  const parsed = z
    .object({ conversationId: id, userIds: z.array(id).min(1).max(200) })
    .safeParse({ conversationId, userIds });
  if (!parsed.success || !(await active())) {
    return { ok: false, message: "Choose someone to add." };
  }
  const added = await addGroupMembers(parsed.data.conversationId, parsed.data.userIds);
  if (added === null) {
    return {
      ok: false,
      message: "That didn't work. Only the person who made the group can add people.",
    };
  }
  refresh();
  return { ok: true, message: added === 1 ? "Added 1 person." : `Added ${added} people.` };
}

export async function removeGroupMemberAction(
  conversationId: string,
  userId: string,
): Promise<boolean> {
  if (!id.safeParse(conversationId).success || !id.safeParse(userId).success || !(await active())) {
    return false;
  }
  const removed = await removeGroupMember(conversationId, userId);
  if (removed) {
    refresh();
  }
  return removed;
}

/** Leaves a group of chosen people, then goes back to the list. */
export async function leaveGroupAction(formData: FormData): Promise<void> {
  const conversationId = id.safeParse(formData.get("conversationId"));
  if (!conversationId.success || !(await active())) {
    return;
  }
  if (await leaveGroup(conversationId.data)) {
    redirect("/messages");
  }
}

/** A one-minute link to open a full photo or download a document, for someone in the chat. */
export async function attachmentLinkAction(attachmentId: string): Promise<string | null> {
  if (!id.safeParse(attachmentId).success || !(await active())) {
    return null;
  }
  return getAttachmentLink(attachmentId);
}

/** GIF search, rated G (ADD-MSG-08). Says when the GIPHY key isn't set up yet. */
export async function searchGifsAction(query: string): Promise<GifSearch> {
  if (typeof query !== "string" || !(await active())) {
    return { configured: true, results: [] };
  }
  return searchGifs(query);
}

/** Messages sent or deleted since `after`, for live updates and catching up after being offline. */
export async function fetchMessagesAction(
  conversationId: string,
  after: string | null,
): Promise<ChatMessage[]> {
  const parsed = z
    .object({ conversationId: id, after: z.iso.datetime({ offset: true }).nullable() })
    .safeParse({ conversationId, after });
  if (!parsed.success || !(await active())) {
    return [];
  }
  try {
    return await getMessages(parsed.data.conversationId, parsed.data.after ?? undefined);
  } catch {
    return [];
  }
}

export async function deleteMessageAction(messageId: string): Promise<boolean> {
  return id.safeParse(messageId).success && (await active()) && (await deleteMessage(messageId));
}

export async function markReadAction(conversationId: string): Promise<void> {
  if (id.safeParse(conversationId).success && (await active())) {
    await markConversationRead(conversationId);
  }
}

export async function unreadMessagesAction(): Promise<number> {
  return (await active()) ? getMessagesUnread() : 0;
}

export async function setMutedAction(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = z
    .object({ conversationId: id, muted: z.enum(["true", "false"]) })
    .safeParse(Object.fromEntries(formData));
  if (
    !parsed.success ||
    !(await active()) ||
    !(await setConversationMuted(parsed.data.conversationId, parsed.data.muted === "true"))
  ) {
    return { status: "error", message: "That didn't save. Try again." };
  }
  refresh();
  return {
    status: "done",
    message: parsed.data.muted === "true" ? "Muted. You won't be notified." : "Notifications on.",
  };
}

export async function startDirectAction(formData: FormData): Promise<void> {
  const userId = id.safeParse(formData.get("userId"));
  if (!userId.success || !(await active())) {
    return;
  }
  const conversationId = await startDirectConversation(userId.data);
  if (conversationId) {
    redirect(`/messages/${conversationId}`);
  }
}

export async function createGroupAction(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = z
    .object({
      title: groupTitleSchema,
      everyone: z.enum(["true", "false"]),
      userIds: z.array(id).max(1000),
    })
    .safeParse({
      title: formData.get("title"),
      everyone: formData.get("everyone") === "true" ? "true" : "false",
      userIds: formData.getAll("userId"),
    });
  if (!parsed.success) {
    return { status: "error", message: "Give the group a name of up to 60 characters." };
  }
  const { title, everyone, userIds } = parsed.data;
  if (everyone === "false" && userIds.length === 0) {
    return { status: "error", message: "Choose at least one person, or turn on Everyone." };
  }
  if (!(await active())) {
    return { status: "error", message: "Sign in again to make a group." };
  }
  const conversationId = await createGroupConversation(title, everyone === "true", userIds);
  if (!conversationId) {
    return {
      status: "error",
      message:
        "That didn't work. Only leaders can make group chats. Check your role, then try again.",
    };
  }
  redirect(`/messages/${conversationId}`);
}

export async function renameGroupAction(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = z
    .object({ conversationId: id, title: groupTitleSchema })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", message: "Give the group a name of up to 60 characters." };
  }
  if (
    !(await active()) ||
    !(await renameGroupConversation(parsed.data.conversationId, parsed.data.title))
  ) {
    return { status: "error", message: "That didn't save. Check your role, then try again." };
  }
  refresh();
  return { status: "done", message: "Renamed." };
}
