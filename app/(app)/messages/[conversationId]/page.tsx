import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireActiveUser } from "@/lib/data/auth";
import { getConversation, getMessages, getMessagingPeople } from "@/lib/data/messages";
import { publicEnv } from "@/lib/env";
import { ChatThread } from "./chat-thread";

export const metadata: Metadata = { title: "Chat" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function ConversationPage({ params }: PageProps<"/messages/[conversationId]">) {
  return (
    <Suspense fallback={<div className="flex-1" aria-busy="true" />}>
      <Conversation params={params} />
    </Suspense>
  );
}

/** One chat (ADD-MSG-01 to 03). Only its members get this far: the database checks. */
async function Conversation({ params }: Pick<PageProps<"/messages/[conversationId]">, "params">) {
  const user = await requireActiveUser();
  const { conversationId } = await params;
  if (!UUID.test(conversationId)) {
    notFound();
  }
  const conversation = await getConversation(conversationId);
  if (!conversation) {
    notFound();
  }
  // Someone who manages a group of chosen people can add anyone active to it.
  const manages = conversation.kind === "group" && !conversation.everyone && conversation.canRename;
  const [messages, peopleToAdd] = await Promise.all([
    getMessages(conversationId),
    manages ? getMessagingPeople() : Promise.resolve(null),
  ]);
  const env = publicEnv();
  return (
    <ChatThread
      key={conversation.id}
      conversation={conversation}
      initialMessages={messages}
      me={user.id}
      nowIso={new Date().toISOString()}
      supabaseUrl={env.NEXT_PUBLIC_SUPABASE_URL}
      publishableKey={env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY}
      peopleToAdd={peopleToAdd}
    />
  );
}
