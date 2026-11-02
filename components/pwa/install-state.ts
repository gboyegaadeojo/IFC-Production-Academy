"use client";

/**
 * Whether and how this device can install the Academy (SPEC §PWA: an install button on Android,
 * Share then Add to Home Screen on iPhone and iPad). Chrome fires `beforeinstallprompt` once, early,
 * so ServiceWorkerSetup keeps it here for the install buttons to use later.
 */
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();

export function keepInstallPrompt(event: Event) {
  event.preventDefault();
  deferred = event as InstallPromptEvent;
  listeners.forEach((listener) => listener());
}

export function forgetInstallPrompt() {
  deferred = null;
  listeners.forEach((listener) => listener());
}

export function onInstallPromptChange(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function canPromptInstall() {
  return deferred !== null;
}

/** Shows the browser's own install dialog; true when they chose to install. */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) {
    return false;
  }
  const event = deferred;
  await event.prompt();
  const { outcome } = await event.userChoice;
  forgetInstallPrompt();
  return outcome === "accepted";
}

export type InstallKind = "installed" | "prompt" | "ios" | "other";

/** Installed already, Android-style prompt, iPhone/iPad steps, or another browser. */
export function installKind(): InstallKind {
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (standalone) {
    return "installed";
  }
  if (canPromptInstall()) {
    return "prompt";
  }
  const ua = navigator.userAgent;
  const ios =
    /iPhone|iPad|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
  return ios ? "ios" : "other";
}

/** Phones and tablets, where installing makes most sense. */
export function isTouchDevice() {
  return window.matchMedia("(pointer: coarse)").matches;
}
