import type { Metadata } from "next";
import { Suspense } from "react";
import { ActionForm } from "@/components/ui/action-form";
import { LoadingStatus, Skeleton } from "@/components/ui/skeleton";
import { requireActiveUser } from "@/lib/data/auth";
import { getAlertsSetupNeeded, getMyAlertException, getMyDevices } from "@/lib/data/push";
import { formatDate } from "@/lib/domain/dates";
import { Button } from "@/components/ui/button";
import { removeDeviceAction, setAlertsUnavailableAction } from "./actions";
import { DeviceAlerts } from "./device-alerts";
import { InstallCard } from "./install-card";

export const metadata: Metadata = { title: "Get the app" };

export default function GetTheAppPage() {
  return (
    <div className="page-container flex max-w-3xl flex-col gap-8 py-8 lg:py-12">
      <header className="flex flex-col gap-2">
        <p className="eyebrow">Account</p>
        <h1 className="text-title font-semibold">Get the app</h1>
        <p className="max-w-[40rem] text-lead text-text-secondary">
          Put the Academy on your phone&apos;s Home Screen and get alerts like any other app.
          It&apos;s free and takes a minute.
        </p>
      </header>

      <section aria-labelledby="install-heading" className="flex flex-col gap-3">
        <h2 id="install-heading" className="font-semibold">
          Install on this device
        </h2>
        <InstallCard />
      </section>

      <section aria-labelledby="alerts-heading" className="flex flex-col gap-3">
        <h2 id="alerts-heading" className="font-semibold">
          Alerts on this device
        </h2>
        <DeviceAlerts />
        <p className="text-small text-text-secondary">
          The same updates as your Notifications: being scheduled, results, requests and reminders.
          Emails still come as you&apos;ve chosen. Alerts show a short line on your lock screen; the
          details stay in the app. Each phone or computer is turned on separately.
        </p>
      </section>

      <Suspense fallback={null}>
        <CantTurnOn />
      </Suspense>

      <Suspense
        fallback={
          <div aria-busy="true" className="flex flex-col gap-3">
            <LoadingStatus label="Loading your devices…" />
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-16" />
          </div>
        }
      >
        <Devices />
      </Suspense>
    </div>
  );
}

/** For phones that can't do alerts, so the request stops and leaders know (decision 2026-11-05). */
async function CantTurnOn() {
  await requireActiveUser();
  const [needed, excepted] = await Promise.all([getAlertsSetupNeeded(), getMyAlertException()]);
  if (excepted) {
    return (
      <form
        action={setAlertsUnavailableAction.bind(null, false)}
        className="flex flex-col items-start gap-2 rounded-card border border-border bg-surface p-4"
      >
        <p className="text-small text-text-secondary">
          You&apos;ve said your phone can&apos;t do alerts, so your leaders know and you&apos;ll get
          emails instead.
        </p>
        <Button type="submit" variant="secondary" size="sm">
          My phone can do it now
        </Button>
      </form>
    );
  }
  if (!needed) {
    return null;
  }
  return (
    <form
      action={setAlertsUnavailableAction.bind(null, true)}
      className="flex flex-col items-start gap-2 rounded-card border border-border bg-surface p-4"
    >
      <p className="text-small text-text-secondary">
        Alerts need iOS 16.4 or later on an iPhone, or a recent Android phone. If yours can&apos;t
        do it, let us know. Your leaders will see that, and you&apos;ll get emails instead.
      </p>
      <Button type="submit" variant="secondary" size="sm">
        My phone can&apos;t do this
      </Button>
    </form>
  );
}

/** Your devices with alerts on (G's request, 2026-11-01), each removable. */
async function Devices() {
  await requireActiveUser();
  const devices = await getMyDevices();
  return (
    <section aria-labelledby="devices-heading" className="flex flex-col gap-3">
      <h2 id="devices-heading" className="font-semibold">
        Your devices with alerts
      </h2>
      {devices.length === 0 ? (
        <p className="rounded-card border border-border bg-surface p-4 text-small text-text-secondary">
          None yet. Turn on alerts above, on each phone or computer you use.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-card border border-border bg-surface">
          {devices.map((device) => (
            <li key={device.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="flex flex-col">
                <span className="font-medium">{device.label}</span>
                <span className="text-small text-text-muted">
                  Added {formatDate(device.addedAt)}
                </span>
              </span>
              <ActionForm
                action={removeDeviceAction}
                submitLabel="Remove"
                pendingLabel="Removing…"
                variant="secondary"
                hidden={{ deviceId: device.id }}
                srLabel={device.label}
                className="flex"
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
