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

## What gets sent

**Sentry** receives the error, where in the code it happened, the browser, and the page's address.
Stack traces from the browser are minified, because source maps aren't uploaded.

**PostHog** receives anonymous page views, counted per device. It doesn't record sessions or clicks,
and it isn't told who anyone is, so it can't show one person's activity. Training numbers such as
completion rates come from the Academy's own reports.

## What never gets sent

`lib/domain/monitoring.ts` removes these before anything leaves the app:

- names, email addresses, cookies, request headers, and request bodies
- query strings, which can hold live room tickets and sign-in codes
- invite tokens and certificate references in addresses
- IDs, which become `[id]`
- quoted values in error text, which is where database errors put names

If you add a page whose address holds a secret, add it to `PRIVATE_PATHS` in that file.

## Check it works

1. **Sentry:** after deploying, open the app, then run
   `setTimeout(() => { throw new Error("Monitoring test"); })` in the browser's console. It should
   appear in Sentry within a minute.
2. **PostHog:** open a few pages, then look under Activity. Open an event and check that its address
   has no query string or ID.
