"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { unreadMessagesAction } from "@/app/(app)/messages/actions";
import { onMessagesChanged } from "@/lib/data/messages-live";
import { badgeLabel } from "@/lib/domain/messages";

/**
 * The unread count on Messages (ADD-MSG-03). It updates as soon as a message arrives (MessagesLive),
 * on each page change, and once a minute while the tab is visible as a safety net.
 * It comes after the link's name in the page, so screen readers hear "Messages, 3 unread", and
 * `className` places it: over the icon, or beside the name.
 */
export function MessagesBadge({ initial, className }: { initial: number; className: string }) {
  const [count, setCount] = useState(initial);
  const pathname = usePathname();

  useEffect(() => {
    let cancelled = false;
    const check = () => {
      if (document.visibilityState === "visible") {
        void unreadMessagesAction().then((value) => {
          if (!cancelled) {
            setCount(value);
          }
        });
      }
    };
    check();
    const timer = window.setInterval(check, 60_000);
    document.addEventListener("visibilitychange", check);
    const stopLive = onMessagesChanged(check);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
      stopLive();
    };
  }, [pathname]);

  if (count <= 0) {
    return null;
  }
  return (
    <>
      <span
        aria-hidden="true"
        className={`flex h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-pill bg-accent px-1 text-[0.625rem] leading-none font-bold text-on-accent ${className}`}
      >
        {badgeLabel(count)}
      </span>
      <span className="sr-only">, {count} unread</span>
    </>
  );
}
