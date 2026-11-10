# Monitoring

Sentry tells you when the app breaks. PostHog counts which pages get used. Both are free tiers, and
both are off until you set their keys below. While they're off, the browser doesn't download either
one.

## Turn them on

Add these under GitHub → Settings → Secrets and variables → Actions → **Variables**, then run the
Deploy workflow. They're variables because both values reach the browser, so they can't be secret.

| Variable | Where it comes from |
| --- | --- |
| `SENTRY_DSN` | Sentry → create a Next.js project → Project Settings → Client Keys (DSN) |
| `POSTHOG_KEY` | PostHog → Project Settings → Project API key |
| `POSTHOG_HOST` | Only for PostHog's EU region: `https://eu.i.posthog.com`. Leave it out for the US region |

In PostHog, also turn on **Discard client IP data** under Project Settings.

## Where it's wired

- **Browser:** `instrumentation-client.ts` loads Sentry and PostHog in a quiet moment and counts page views as you move between pages. The page error screen (`app/global-error.tsx`) hands its error to it.
- **Server:** the Worker (`workers/entry.ts`) sets Sentry up and reports the app's server errors, which `instrumentation.ts` passes to it. Don't import Sentry or PostHog anywhere else in the app: each copy adds megabytes to what a cold start loads.

## What gets sent

**Sentry** receives the error, where in the code it happened, the browser, and the page's address.
Stack traces from the browser are minified, because source maps aren't uploaded.

**PostHog** receives anonymous page views, counted per device, and no other kind of event. It
doesn't record sessions, clicks, or page speed, and it isn't told who anyone is, so it can't show
one person's activity. Training numbers such as
completion rates come from the Academy's own reports.

## What never gets sent

`lib/domain/monitoring.ts` removes these before anything leaves the app:

- names, email addresses, cookies, request headers, and request bodies
- query strings, which can hold live room tickets and sign-in codes
- invite tokens and certificate references in addresses
- IDs, which become `[id]`
- quoted values in error text, which is where database errors put names
- page titles, which can name a person or course

Addresses are scrubbed at any depth, because both tools repeat them in fields of their own.

If you add a page whose address holds a secret, add it to `PRIVATE_PATHS` in that file. After any
change to the monitoring code or a library upgrade, repeat the check below with a fake invite link,
such as `/invite/fake-token?code=fake`, and search what's sent for those values. PostHog ignores
automated browsers, so an automated test needs to hide that it's one.

## Check it works

1. **Sentry:** after deploying, open the app, then run
   `setTimeout(() => { throw new Error("Monitoring test"); })` in the browser's console. It should
   appear in Sentry within a minute.
2. **PostHog:** open a few pages, then look under Activity. Open an event and check that its address
   has no query string or ID.
