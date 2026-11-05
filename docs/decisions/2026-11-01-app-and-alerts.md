# Decision: Home Screen app and device alerts (2026-11-01)

**Status:** decided by G, 2026-11-01.

## Ask
G wants to install the Academy on Android and iPhone and to get alerts that drop down like a native app's.

## Decided
- **Install as a Home Screen app (PWA), not App Store or Google Play apps.**
  - Android/Chrome gets an Install button.
  - iPhone/iPad gets "Share, then Add to Home Screen" steps.
  - Free, with no store review. This keeps decision 10: native apps only if the PWA hits limits.
- **Alerts within seconds through web push.**
  - The database triggers the app through `pg_net` the moment a notification is written.
  - The 15-minute job is a backup.
  - Each device is turned on separately, by the person, on the Notifications page.

## Spec
- SPEC §9 put PWA push in Phase 5. G asked for it now, so it moves ahead of the pilot. Email stays the guaranteed channel (SPEC §PWA).
- The rest is the SPEC §PWA launch list: a service worker with an offline page, no caching of private records, and install guidance.

## Limits
- **iPhone and iPad:** alerts need iOS or iPadOS 16.4 or later and the Home Screen app.
- **Alert content:** the alert's title and body are the notification's. They are encrypted end to end to the device.
- **Quiet hours:** they cover alerts too, since [2026-11-05](2026-11-05-alerts.md).
- **Per-type choices:** none for alerts yet. Each device gets every kind of notification.

## Volunteers
Alerts go only to devices where someone turned them on themselves. They mirror what's already in the app, so they don't count as inviting or emailing volunteers before launch.
