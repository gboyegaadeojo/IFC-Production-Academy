import { cache } from "react";
import { MessageIcon } from "@/components/ui/icons";
import { getCurrentUser } from "@/lib/data/auth";
import { getFeatureFlags } from "@/lib/data/features";
import { getMessagesUnread } from "@/lib/data/messages";
import { AcademyNavLink, AcademyTabBar } from "./academy-nav";
import { MessagesBadge } from "./messages-badge";

/** Whether to offer Messages, and the unread count, once per request (ADD-FLAG-01, ADD-MSG-03). */
const loadMessages = cache(async (): Promise<{ unread: number } | null> => {
  const user = await getCurrentUser();
  if (user?.status !== "active" || !(await getFeatureFlags()).messaging) {
    return null;
  }
  return { unread: await getMessagesUnread() };
});

/** Messages in the side bar, under Training (side bar B, G 2026-11-09), while messaging is on. */
export async function MessagesNavLink() {
  const messages = await loadMessages();
  if (!messages) {
    return null;
  }
  return (
    <li>
      <AcademyNavLink
        href="/messages"
        label="Messages"
        icon={<MessageIcon className="size-5" />}
        badge={
          <MessagesBadge
            initial={messages.unread}
            className="shrink-0 group-data-[folded=true]/sidebar:absolute group-data-[folded=true]/sidebar:top-0 group-data-[folded=true]/sidebar:right-1 group-data-[folded=true]/sidebar:ring-2 group-data-[folded=true]/sidebar:ring-surface"
          />
        }
      />
    </li>
  );
}

/** The phone tab bar, with Messages in the middle while messaging is on. */
export async function MessagesAwareTabBar() {
  return <AcademyTabBar messages={await loadMessages()} />;
}
