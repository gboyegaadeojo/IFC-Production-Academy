"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { MESSAGES_CHANGED, subscribeToMyChats } from "@/lib/data/messages-live";

/** Waits this long after a message so a burst is one refresh, and the open chat can mark it read. */
const SETTLE_MS = 800;

/**
 * New messages show within a second or two everywhere in the app (ADD-MSG-03; G, 2026-11-12):
 * the Messages count, the number on the app's icon, and the chat list. One live connection while
 * the app is on screen, closed when it's hidden, to stay inside the free plan's 200 connections.
 * The once-a-minute checks stay as a safety net. Renders nothing.
 */
export function MessagesLive({
  supabaseUrl,
  publishableKey,
}: {
  supabaseUrl: string;
  publishableKey: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const pathRef = useRef(pathname);
  useEffect(() => {
    pathRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    let timer: number | null = null;
    const changed = () => {
      if (timer !== null) {
        window.clearTimeout(timer);
      }
      timer = window.setTimeout(() => {
        timer = null;
        window.dispatchEvent(new Event(MESSAGES_CHANGED));
        if (pathRef.current.startsWith("/messages")) {
          router.refresh();
        }
      }, SETTLE_MS);
    };
    const start = () => {
      unsubscribe ??= subscribeToMyChats({ url: supabaseUrl, publishableKey, onChange: changed });
    };
    const stop = () => {
      unsubscribe?.();
      unsubscribe = null;
    };
    const onVisibility = () => (document.visibilityState === "visible" ? start() : stop());
    if (document.visibilityState === "visible") {
      start();
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      if (timer !== null) {
        window.clearTimeout(timer);
      }
      stop();
    };
  }, [supabaseUrl, publishableKey, router]);

  return null;
}
