"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

/**
 * On phones the list is its own page, so it steps aside while a chat is open. From 768px it always
 * sits beside the chat.
 */
export function ListPane({ children }: { children: ReactNode }) {
  const onList = usePathname() === "/messages";
  return (
    <aside
      aria-label="Chats"
      className={`min-w-0 border-border bg-surface md:block md:overflow-y-auto md:border-r ${
        onList ? "block" : "hidden"
      }`}
    >
      {children}
    </aside>
  );
}

/** The open chat. On phones it takes the whole screen; on the list page it's empty there. */
export function ChatPane({ children }: { children: ReactNode }) {
  const onList = usePathname() === "/messages";
  return (
    <div
      className={`min-w-0 md:flex md:min-h-0 md:flex-col ${onList ? "hidden" : "flex flex-col"}`}
    >
      {children}
    </div>
  );
}
