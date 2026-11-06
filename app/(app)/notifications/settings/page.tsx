import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ChevronLeftIcon } from "@/components/ui/icons";
import { Skeleton } from "@/components/ui/skeleton";
import { DeviceAlerts } from "@/app/(app)/get-the-app/device-alerts";
import { requireActiveUser } from "@/lib/data/auth";
import { getMyNotificationChoices, offersLeadingChoices } from "@/lib/data/notifications";
import {
  emailChoiceGroups,
  NOTIFICATION_KINDS,
  type NotificationKind,
} from "@/lib/domain/notifications";
import { NotificationChoices } from "./notification-choices";

export const metadata: Metadata = { title: "Notification settings" };

export default function NotificationSettingsPage() {
  return (
    <div className="page-container flex max-w-[44rem] flex-col gap-6 py-6 lg:py-10">
      <header className="flex flex-col gap-2">
        <Link
          href="/notifications"
          className="-ml-1 flex w-fit items-center gap-1 rounded-button text-small font-medium text-text-secondary hover:text-text"
        >
          <ChevronLeftIcon className="size-4" />
          Notifications
        </Link>
        <h1 className="text-title font-semibold">Notification settings</h1>
        <p className="text-text-secondary">
          Everything always shows under the bell. Choose what also reaches your phone or your email.
        </p>
      </header>

      <section aria-labelledby="device-heading" className="flex flex-col gap-3">
        <h2 id="device-heading" className="font-semibold">
          Alerts on this device
        </h2>
        <DeviceAlerts />
      </section>

      <Suspense fallback={<Skeleton className="h-80" />}>
        <Choices />
      </Suspense>

      <p className="text-small text-text-secondary">
        A moved or cancelled service always comes by email. With alerts on a phone, other emails
        only come for anything you&apos;ve turned off for your phone. New courses, certificates, and
        SOP updates stay in the app.
      </p>
    </div>
  );
}

/**
 * Six choices at most: Serving, Training, and (for leaders) Leading, each for phone and email
 * (SRS-NOTIF-002; refinements mock, approved 2026-11-06).
 */
async function Choices() {
  const user = await requireActiveUser();
  const [preferences, leads] = await Promise.all([
    getMyNotificationChoices(user.id),
    offersLeadingChoices(user.id),
  ]);
  // A kind with no saved choice is on.
  const choicesFrom = (saved: ReadonlyMap<NotificationKind, boolean>) =>
    Object.fromEntries(NOTIFICATION_KINDS.map((kind) => [kind, saved.get(kind) ?? true])) as Record<
      NotificationKind,
      boolean
    >;
  return (
    <NotificationChoices
      groups={emailChoiceGroups(leads)}
      initial={{ phone: choicesFrom(preferences.phone), email: choicesFrom(preferences.email) }}
    />
  );
}
