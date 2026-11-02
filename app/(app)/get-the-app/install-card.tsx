"use client";

import { useSyncExternalStore } from "react";
import {
  installKind,
  onInstallPromptChange,
  promptInstall,
  type InstallKind,
} from "@/components/pwa/install-state";
import { buttonClasses } from "@/components/ui/button";
import { CheckIcon, ChevronDownIcon, ShareIcon } from "@/components/ui/icons";

function subscribe(update: () => void) {
  const media = window.matchMedia("(display-mode: standalone)");
  media.addEventListener("change", update);
  const stop = onInstallPromptChange(update);
  return () => {
    media.removeEventListener("change", update);
    stop();
  };
}

type Platform = "computer" | "ios" | "android";

function platform(): Platform {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1)) {
    return "ios";
  }
  return /Android/.test(ua) ? "android" : "computer";
}

const noop = () => () => {};

function Steps({
  title,
  open,
  children,
}: {
  title: string;
  open: boolean;
  children: React.ReactNode;
}) {
  return (
    <details open={open} className="group border-t border-border">
      <summary className="flex min-h-touch cursor-pointer list-none items-center justify-between gap-3 px-4 font-medium [&::-webkit-details-marker]:hidden">
        {title}
        <ChevronDownIcon className="size-4 text-text-muted transition-transform group-open:rotate-180" />
      </summary>
      <ol className="flex list-decimal flex-col gap-1.5 px-4 pb-4 pl-9 text-small text-text-secondary">
        {children}
      </ol>
    </details>
  );
}

/**
 * "Install on this device" (G's request, 2026-11-01, after the Church Budget layout): the install
 * button where the browser offers one, then the steps for each kind of device, with this device's
 * steps open.
 */
export function InstallCard() {
  const kind = useSyncExternalStore<InstallKind | null>(subscribe, installKind, () => null);
  const here = useSyncExternalStore<Platform | null>(noop, platform, () => null);

  return (
    <div className="overflow-hidden rounded-card border border-border bg-surface">
      <div className="flex min-h-16 items-center px-4 py-3">
        {kind === "installed" ? (
          <p className="flex items-center gap-2 font-medium">
            <CheckIcon className="size-5 text-success" />
            You&apos;re using the app on this device.
          </p>
        ) : kind === "prompt" ? (
          <button
            type="button"
            onClick={() => void promptInstall()}
            className={buttonClasses("primary")}
          >
            Install the app
          </button>
        ) : (
          <p className="text-small text-text-secondary">Follow the steps for your device below.</p>
        )}
      </div>
      <Steps title="On iPhone or iPad" open={here === "ios" && kind !== "installed"}>
        <li>
          Open the Academy in Safari, then tap{" "}
          <ShareIcon className="inline size-4 align-[-3px] text-text" />{" "}
          <span className="font-medium text-text">Share</span>.
        </li>
        <li>
          Choose <span className="font-medium text-text">Add to Home Screen</span>, then{" "}
          <span className="font-medium text-text">Add</span>.
        </li>
        <li>Open IFC Academy from your Home Screen. Alerts need iOS 16.4 or later.</li>
      </Steps>
      <Steps title="On an Android phone" open={here === "android" && kind !== "installed"}>
        <li>
          Open the Academy in Chrome and tap{" "}
          <span className="font-medium text-text">Install the app</span> above, or open
          Chrome&apos;s menu and choose <span className="font-medium text-text">Install app</span>.
        </li>
        <li>IFC Academy appears with your other apps.</li>
      </Steps>
      <Steps title="On a computer" open={here === "computer" && kind !== "installed"}>
        <li>
          In Chrome or Edge, select the install icon at the right of the address bar, or{" "}
          <span className="font-medium text-text">Install the app</span> above.
        </li>
        <li>IFC Academy opens in its own window and appears with your other apps.</li>
      </Steps>
    </div>
  );
}
