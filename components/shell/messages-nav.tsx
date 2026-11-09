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

/** Messages in the side bar, after Schedule (G, 2026-11-08), while messaging is on. */
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
        badge={<MessagesBadge initial={messages.unread} />}
      />
    </li>
  );
}

/** The phone tab bar, with Messages in the middle while messaging is on. */
export async function MessagesAwareTabBar() {
  return <AcademyTabBar messages={await loadMessages()} />;
}
