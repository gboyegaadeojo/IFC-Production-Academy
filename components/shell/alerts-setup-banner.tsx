"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { isTouchDevice } from "@/components/pwa/install-state";
import { buttonClasses } from "@/components/ui/button";
import { BellIcon } from "@/components/ui/icons";

const DISMISSED = "academy-alerts-not-now";

const subscribeNever = () => () => {};

function readTouch(): boolean {
  return isTouchDevice();
}

function readDismissed(): boolean {
  try {
    return sessionStorage.getItem(DISMISSED) === "1";
  } catch {
    return false;
  }
}

/**
 * Asks people on a team to turn on phone alerts (decision 2026-11-05). Only they can, so it asks on
 * each visit until it's done or they say their phone can't. "Not now" lasts until they next open the
 * app, and nothing is locked meanwhile.
 */
export function AlertsSetupBanner() {
  const pathname = usePathname();
  const onPhone = useSyncExternalStore(subscribeNever, readTouch, () => false);
  const dismissedEarlier = useSyncExternalStore(subscribeNever, readDismissed, () => false);
  const [dismissed, setDismissed] = useState(false);
  if (!onPhone || dismissed || dismissedEarlier || pathname === "/get-the-app") {
    return null;
  }
  return (
    <aside
      aria-label="Phone alerts"
      className="flex flex-col gap-2.5 border-b border-border bg-accent-soft px-4 py-3 sm:flex-row sm:items-center sm:justify-between print:hidden"
    >
      <p className="flex items-start gap-2 font-medium">
        <BellIcon className="mt-0.5 size-4 shrink-0 text-accent-light" />
        Turn on alerts, so you don&apos;t miss when you&apos;re serving or when your team needs you.
      </p>
      <div className="flex shrink-0 items-center gap-2">
        <Link href="/get-the-app" className={buttonClasses("primary", "min-h-touch")}>
          Set up alerts
        </Link>
        <button
          type="button"
          onClick={() => {
            setDismissed(true);
            try {
              sessionStorage.setItem(DISMISSED, "1");
            } catch {
              // Without storage it simply asks again on the next page load.
            }
          }}
          className={buttonClasses("tertiary", "min-h-touch px-2 text-text-secondary")}
        >
          Not now
        </button>
      </div>
    </aside>
  );
}
