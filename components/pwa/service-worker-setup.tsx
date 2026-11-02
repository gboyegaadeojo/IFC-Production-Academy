"use client";

import { useEffect } from "react";
import { forgetInstallPrompt, keepInstallPrompt } from "./install-state";

/**
 * Registers the service worker (public/sw.js) and keeps Chrome's install prompt for later. Renders
 * nothing. Skipped in development, where a service worker gets in the way of hot reload.
 */
export function ServiceWorkerSetup() {
  useEffect(() => {
    window.addEventListener("beforeinstallprompt", keepInstallPrompt);
    window.addEventListener("appinstalled", forgetInstallPrompt);
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        // Without a service worker the site still works; it just can't be installed or alert.
      });
    }
    return () => {
      window.removeEventListener("beforeinstallprompt", keepInstallPrompt);
      window.removeEventListener("appinstalled", forgetInstallPrompt);
    };
  }, []);
  return null;
}
