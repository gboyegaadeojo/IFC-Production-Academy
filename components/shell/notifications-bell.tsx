import Link from "next/link";
import { BellIcon } from "@/components/ui/icons";

/**
 * The bell beside the account button (mock 5, G, 2026-11-06). The dot shows there's something
 * unread, and the count is in its name, so colour is never the only signal.
 */
export function NotificationsBell({ unread }: { unread: number }) {
  const label =
    unread > 0 ? `Notifications, ${unread > 99 ? "99+" : unread} unread` : "Notifications";
  return (
    <Link
      href="/notifications"
      aria-label={label}
      title="Notifications"
      className="relative flex size-10 shrink-0 items-center justify-center rounded-pill bg-card text-text transition-surface hover:bg-hover"
    >
      <BellIcon className="size-5" />
      {unread > 0 ? (
        <span
          aria-hidden="true"
          className="absolute top-2 right-2.5 size-2 rounded-pill bg-error ring-2 ring-card"
        />
      ) : null}
    </Link>
  );
}
