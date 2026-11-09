"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { unreadMessagesAction } from "@/app/(app)/messages/actions";
import { badgeLabel } from "@/lib/domain/messages";

/**
 * The unread count on Messages (ADD-MSG-03). It checks once a minute while the tab is visible, and
 * on each page change, rather than holding a live connection open, to stay inside the free plan.
 */
export function MessagesBadge({ initial }: { initial: number }) {
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
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, [pathname]);

  if (count <= 0) {
    return null;
  }
  return (
    <span className="absolute -top-1 -right-1 flex h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-pill bg-accent px-1 text-[0.625rem] leading-none font-bold text-on-accent">
      {badgeLabel(count)}
      <span className="sr-only"> unread</span>
    </span>
  );
}
