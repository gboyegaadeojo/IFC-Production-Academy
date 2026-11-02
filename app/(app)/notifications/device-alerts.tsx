"use client";

import { useEffect, useState } from "react";
import { InstallApp } from "@/components/pwa/install-app";
import { installKind } from "@/components/pwa/install-state";
import { buttonClasses } from "@/components/ui/button";
import { base64UrlDecode } from "@/lib/domain/web-push";
import {
  removePushSubscriptionAction,
  savePushSubscriptionAction,
  sendTestAlertAction,
} from "./push-actions";

type State = "checking" | "unsupported" | "install-first" | "denied" | "off" | "on" | "unavailable";

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

/** A plain name for this device, so people can tell their devices apart later. */
function deviceLabel(): string {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1)) return "iPad";
  if (/Android/.test(ua)) return "Android phone";
  if (/Macintosh/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows computer";
  return "This device";
}

async function registration(): Promise<ServiceWorkerRegistration> {
  return (
    (await navigator.serviceWorker.getRegistration("/")) ??
    (await navigator.serviceWorker.register("/sw.js", { scope: "/" }))
  );
}

/**
 * "Alerts on this device" (SRS-NOTIF-005; G's request, 2026-11-01): turns on system alerts that
 * drop down like a native app's. On iPhone and iPad this works only once the Academy is on the
 * Home Screen (iOS 16.4 or later), so it asks for that first.
 */
export function DeviceAlerts() {
  const [state, setState] = useState<State>("checking");
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const supported =
        "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
      let next: State;
      let current: string | null = null;
      if (!PUBLIC_KEY) {
        next = "unavailable";
      } else if (!supported) {
        next = installKind() === "ios" ? "install-first" : "unsupported";
      } else if (Notification.permission === "denied") {
        next = "denied";
      } else {
        const reg = await navigator.serviceWorker.getRegistration("/");
        const sub = reg ? await reg.pushManager.getSubscription() : null;
        current = sub?.endpoint ?? null;
        next = sub ? "on" : "off";
      }
      if (!cancelled) {
        setEndpoint(current);
        setState(next);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function turnOn() {
    setBusy(true);
    setMessage("");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }
      const reg = await registration();
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlDecode(PUBLIC_KEY),
      });
      const json = sub.toJSON();
      const saved = await savePushSubscriptionAction({
        subscription: { endpoint: json.endpoint, p256dh: json.keys?.p256dh, auth: json.keys?.auth },
        label: deviceLabel(),
      });
      if (!saved.ok) {
        await sub.unsubscribe();
        setMessage("Alerts couldn't be turned on. Try again in a moment.");
        return;
      }
      setEndpoint(sub.endpoint);
      setState("on");
      setMessage("Alerts are on for this device.");
    } catch {
      setMessage("Alerts couldn't be turned on on this device.");
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    setMessage("");
    try {
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) {
        await removePushSubscriptionAction(sub.endpoint);
        await sub.unsubscribe();
      }
      setEndpoint(null);
      setState("off");
      setMessage("Alerts are off for this device.");
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    if (!endpoint) return;
    setBusy(true);
    const { outcome } = await sendTestAlertAction(endpoint);
    setBusy(false);
    setMessage(
      outcome === "sent"
        ? "Test alert sent. It should drop down in a few seconds."
        : outcome === "gone"
          ? "This device stopped accepting alerts. Turn them on again."
          : "The test alert couldn't be sent.",
    );
    if (outcome === "gone") {
      setEndpoint(null);
      setState("off");
    }
  }

  return (
    <section
      aria-labelledby="device-alerts-heading"
      className="flex flex-col gap-4 rounded-card border border-border bg-surface p-5"
    >
      <div className="flex flex-col gap-1">
        <h2 id="device-alerts-heading" className="font-semibold">
          Alerts on this device
        </h2>
        <p className="text-small text-text-secondary">
          Updates drop down like a text message, even when the Academy isn&apos;t open. Each phone
          or computer is turned on separately.
        </p>
      </div>

      {state === "checking" ? null : state === "unavailable" ? (
        <p className="text-small text-text-secondary">Alerts aren&apos;t switched on yet.</p>
      ) : state === "install-first" ? (
        <>
          <p className="text-small text-text-secondary">
            On iPhone and iPad, add the Academy to your Home Screen first, then open it from there
            and come back to this page.
          </p>
          <InstallApp variant="card" />
        </>
      ) : state === "unsupported" ? (
        <p className="text-small text-text-secondary">
          This browser can&apos;t show alerts. Try Chrome, Edge, Firefox or Safari, or install the
          Academy on your phone.
        </p>
      ) : state === "denied" ? (
        <p className="text-small text-text-secondary">
          Alerts are blocked for the Academy on this device. To allow them, open your browser or
          phone settings, find IFC Academy under Notifications, and turn them on. Then reload this
          page.
        </p>
      ) : state === "on" ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void test()}
            disabled={busy}
            className={buttonClasses("secondary", "", "sm")}
          >
            Send a test alert
          </button>
          <button
            type="button"
            onClick={() => void turnOff()}
            disabled={busy}
            className={buttonClasses("secondary", "", "sm")}
          >
            Turn off on this device
          </button>
        </div>
      ) : (
        <div>
          <button
            type="button"
            onClick={() => void turnOn()}
            disabled={busy}
            className={buttonClasses("primary", "", "sm")}
          >
            Turn on alerts
          </button>
        </div>
      )}

      <p role="status" className="text-small text-text-secondary empty:hidden">
        {message}
      </p>

      {state !== "install-first" && state !== "checking" ? (
        <div className="flex flex-col gap-2 border-t border-border pt-4">
          <h3 className="text-small font-semibold">The app</h3>
          <InstallApp variant="card" />
        </div>
      ) : null}
    </section>
  );
}
