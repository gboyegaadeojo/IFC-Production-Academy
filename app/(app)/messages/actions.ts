"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/components/ui/action-form";
import { getCurrentUser } from "@/lib/data/auth";
import {
  createGroupConversation,
  deleteMessage,
  getMessages,
  getMessagesUnread,
  markConversationRead,
  renameGroupConversation,
  sendMessage,
  setConversationMuted,
  startDirectConversation,
} from "@/lib/data/messages";
import { groupTitleSchema, messageBodySchema, type ChatMessage } from "@/lib/domain/messages";

// Team messaging (ADD-MSG-01 to 03, 07). Inputs are checked here; the database checks the feature
// flag, membership, and capabilities, and audits deletions and groups.

const id = z.uuid();

async function active(): Promise<boolean> {
  return (await getCurrentUser())?.status === "active";
}

export type SendResult = { ok: true; messages: ChatMessage[] } | { ok: false; message: string };

/** Sends, then returns what's new since `after`, including the sent message. Safe to retry. */
export async function sendMessageAction(input: {
  conversationId: string;
  clientId: string;
  body: string;
  replyTo: string | null;
  after: string | null;
}): Promise<SendResult> {
  const parsed = z
    .object({
      conversationId: id,
      clientId: id,
      body: messageBodySchema,
      replyTo: id.nullable(),
      after: z.iso.datetime({ offset: true }).nullable(),
    })
    .safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Write a message first, up to 4,000 characters." };
  }
  if (!(await active())) {
    return { ok: false, message: "Sign in again to send messages." };
  }
  const { conversationId, clientId, body, replyTo, after } = parsed.data;
  const sent = await sendMessage(conversationId, clientId, body, replyTo);
  if (!sent) {
    return { ok: false, message: "That didn't send. Check your connection and try again." };
  }
  return { ok: true, messages: await getMessages(conversationId, after ?? undefined) };
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
