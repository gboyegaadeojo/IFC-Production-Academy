"use client";

import { useBrand } from "@/components/brand-context";
import { useSyncExternalStore } from "react";
import { buttonClasses } from "@/components/ui/button";
import { CloseIcon, ShareIcon, SmartphoneIcon } from "@/components/ui/icons";
import {
  installKind,
  isTouchDevice,
  onInstallPromptChange,
  promptInstall,
  type InstallKind,
} from "./install-state";

const DISMISSED = "academy-install-dismissed";

function subscribeKind(update: () => void) {
  const media = window.matchMedia("(display-mode: standalone)");
  media.addEventListener("change", update);
  const stop = onInstallPromptChange(update);
  return () => {
    media.removeEventListener("change", update);
    stop();
  };
}

const dismissListeners = new Set<() => void>();
function subscribeDismissed(update: () => void) {
  dismissListeners.add(update);
  return () => {
    dismissListeners.delete(update);
  };
}

/** The device's install state; null while rendering on the server, which can't know the device. */
function useInstallKind(): InstallKind | null {
  return useSyncExternalStore(subscribeKind, installKind, () => null);
}

function useDismissed(): boolean {
  return useSyncExternalStore(
    subscribeDismissed,
    () => window.localStorage.getItem(DISMISSED) === "1",
    () => true,
  );
}

function dismiss() {
  window.localStorage.setItem(DISMISSED, "1");
  dismissListeners.forEach((listener) => listener());
}

function IosSteps() {
  const { shortName } = useBrand();
  return (
    <ol className="flex list-decimal flex-col gap-1 pl-5 text-small text-text-secondary">
      <li>
        Tap <ShareIcon className="inline size-4 align-[-3px] text-text" />{" "}
        <span className="font-medium text-text">Share</span> in Safari&apos;s toolbar.
      </li>
      <li>
        Choose <span className="font-medium text-text">Add to Home Screen</span>, then{" "}
        <span className="font-medium text-text">Add</span>.
      </li>
      <li>Open {shortName} from your Home Screen.</li>
    </ol>
  );
}

/**
 * "Put the Academy on your Home Screen" (SPEC §PWA): Android gets an Install button, iPhone and
 * iPad get the Share steps. The banner shows on phones until it's installed or dismissed; the card
 * (on the Notifications page) always explains where things stand.
 */
export function InstallApp({ variant }: { variant: "banner" | "card" }) {
  const kind = useInstallKind();
  const dismissed = useDismissed();

  if (kind === null) {
    return null;
  }

  if (variant === "banner") {
    if (dismissed || (kind !== "prompt" && kind !== "ios") || !isTouchDevice()) {
      return null;
    }
    return (
      <section
        aria-labelledby="install-banner-heading"
        className="relative flex max-w-2xl flex-col gap-3 rounded-card border border-border bg-surface p-4 pr-12"
      >
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex size-9 shrink-0 items-center justify-center rounded-button bg-accent-soft text-accent-light"
          >
            <SmartphoneIcon className="size-5" />
          </span>
          <div className="flex flex-col">
            <h2 id="install-banner-heading" className="font-semibold">
              Put the Academy on your Home Screen
            </h2>
            <p className="text-small text-text-secondary">
              It opens like an app, and can alert you when something needs you.
            </p>
          </div>
        </div>
        {kind === "prompt" ? (
          <div>
            <button
              type="button"
              onClick={() => void promptInstall()}
              className={buttonClasses("primary", "", "sm")}
            >
              Install the app
            </button>
          </div>
        ) : (
          <IosSteps />
        )}
        <button
          type="button"
          onClick={dismiss}
          className="absolute top-2 right-2 flex size-11 items-center justify-center rounded-button text-text-muted hover:bg-hover hover:text-text"
        >
          <CloseIcon className="size-4" />
          <span className="sr-only">Not now</span>
        </button>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {kind === "installed" ? (
        <p className="text-small text-text-secondary">You&apos;re using the app on this device.</p>
      ) : kind === "prompt" ? (
        <>
          <p className="text-small text-text-secondary">
            Install the Academy on this device. It opens full screen from its own icon.
          </p>
          <div>
            <button
              type="button"
              onClick={() => void promptInstall()}
              className={buttonClasses("primary", "", "sm")}
            >
              Install the app
            </button>
          </div>
        </>
      ) : kind === "ios" ? (
        <>
          <p className="text-small text-text-secondary">
            Add the Academy to your Home Screen. Alerts on iPhone and iPad work only from there (iOS
            16.4 or later).
          </p>
          <IosSteps />
        </>
      ) : (
        <p className="text-small text-text-secondary">
          On your phone, open the Academy in Chrome (Android) or Safari (iPhone) to install it. On a
          computer, use the install icon in your browser&apos;s address bar, if it has one.
        </p>
      )}
    </div>
  );
}
