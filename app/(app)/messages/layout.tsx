import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireActiveUser } from "@/lib/data/auth";
import { getFeatureFlags } from "@/lib/data/features";
import { getMyConversations } from "@/lib/data/messages";
import { conversationPreview, listTime } from "@/lib/domain/messages";
import { ConversationList } from "./conversation-list";
import { ChatPane, ListPane } from "./list-pane";

/**
 * Messages (ADD-MSG-01 to 03; option C, approved 2026-11-08). Only while the messaging feature is
 * on (ADD-FLAG-01); the database refuses it otherwise too.
 */
export default function MessagesLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<div className="min-h-dvh" aria-busy="true" />}>
      <MessagesShell>{children}</MessagesShell>
    </Suspense>
  );
}

async function MessagesShell({ children }: { children: ReactNode }) {
  await requireActiveUser();
  if (!(await getFeatureFlags()).messaging) {
    notFound();
  }
  const chats = await getMyConversations();
  const now = new Date();
  const rows = chats.map((chat) => ({
    id: chat.id,
    kind: chat.kind,
    title: chat.title,
    hue: chat.departmentHue,
    icon: chat.departmentIcon,
    preview: conversationPreview(chat),
    time: chat.lastMessageAt ? listTime(chat.lastMessageAt, now) : null,
    unread: chat.unread,
    muted: chat.muted,
  }));

  return (
    <div className="md:grid md:h-dvh md:grid-cols-[20rem_minmax(0,1fr)] lg:grid-cols-[22rem_minmax(0,1fr)]">
      <ListPane>
        <ConversationList rows={rows} />
      </ListPane>
      <ChatPane>{children}</ChatPane>
    </div>
  );
}
