import type { Metadata } from "next";
import { Suspense } from "react";
import { ActionForm } from "@/components/ui/action-form";
import { LoadingStatus, Skeleton } from "@/components/ui/skeleton";
import { requireActiveUser } from "@/lib/data/auth";
import { getMyDevices } from "@/lib/data/push";
import { formatDate } from "@/lib/domain/dates";
import { removeDeviceAction } from "./actions";
import { DeviceAlerts } from "./device-alerts";
import { InstallCard } from "./install-card";

export const metadata: Metadata = { title: "Get the app" };

export default function GetTheAppPage() {
  return (
    <div className="page-container flex max-w-3xl flex-col gap-8 py-8 lg:py-12">
      <header className="flex flex-col gap-2">
        <p className="eyebrow">Account</p>
        <h1 className="text-display font-semibold">Get the app</h1>
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
