# Device alerts (web push)

Alerts that drop down on phones and computers, like a native app's, for anyone who turns them on under **Notifications → Alerts on this device**. Decided by G on 2026-11-01: the Academy is installed as a Home Screen app (no app stores), and alerts arrive within seconds. Details are in `docs/decisions/2026-11-01-app-and-alerts.md`.

## How it works

1. Something writes a notification (`private.notify`).
2. A database trigger calls `POST /api/push/dispatch` through `pg_net`, sending the notification id and a token that the database generated itself (`private.app_settings`). The token never appears in the repo or a log.
3. The app claims the notification once (`claim_push`), gets the person's devices, and sends each one an encrypted alert (`lib/domain/web-push.ts`, RFC 8291 and RFC 8292).
4. Anything not sent within a minute is picked up by `notifications.yml` (every 15 minutes) through `claim_push_batch`. Alerts older than a day are dropped.
5. A device the push service reports as gone (404 or 410) is deleted.

There are no quiet hours: alerts and emails go out at any time of day (G, 2026-11-09). Phones have their own Do Not Disturb.

## Setup (once)

1. Run `npm run push:keys` from the repo, signed in to the GitHub CLI. It makes a VAPID key pair (P-256) and saves:
   - GitHub variable `VAPID_PUBLIC_KEY`: the public key (base64url, 65 bytes uncompressed).
   - GitHub secret `VAPID_PRIVATE_KEY`: the private key (base64url `d`, 32 bytes). It's never printed or written to disk.
2. Deploy (push to `main`, or run the Deploy workflow):
   - The build gets the public key.
   - The deploy copies the private key to the Worker with `wrangler secret put`.
   - The deploy points the database at `<SITE_URL>/api/push/dispatch`.

Until both keys are set, alerts stay off and the Notifications page says so.

## Rotating the keys

New keys invalidate every device's subscription. Rotate only if the private key leaks. After rotating (`npm run push:keys` again), everyone must turn alerts on again on each device.

## iPhone and iPad

Alerts work only after the Academy is added to the Home Screen and opened from there, on iOS or iPadOS 16.4 or later. The Notifications page explains this and shows the Share → Add to Home Screen steps.

## Checking

- Notifications page → **Send a test alert**: it goes straight to that device, with no notification written.
- The `notifications.yml` log shows counts only: `Device alerts: N sent, N devices gone, N failed`.
