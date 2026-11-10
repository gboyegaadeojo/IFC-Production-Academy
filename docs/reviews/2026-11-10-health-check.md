# Health check, 10 November 2026

A full check of the Academy before more volunteers join: the automated tests, the live site, the
live database, the scheduled jobs, and the dependencies. Everything found broken was fixed the same
day. This is the record.

## What was checked

| Area | How | Result |
| --- | --- | --- |
| Code | Typecheck, lint, formatting, 885 unit tests | Pass |
| Database rules and screens | 88 pgTAP files and the Playwright end-to-end suite, in CI on every PR | Pass (after the fixes below) |
| Scheduled jobs | Last result of every workflow, and every failure in the past week | One outage (below); the rest pass |
| Live site | Every page and API route requested signed out; live version compared with `main` | No server errors; private pages redirect to sign-in and show nothing; live is the latest |
| Live database: what the app calls | Each of the 237 functions the code calls exists and the right role can run it | Pass |
| Live database: what the app reads and writes | Each of 123 table operations (80 tables) is allowed for signed-in users | Pass (column-level grants) |
| Live database: queues | Notification emails and phone alerts, last 14 days, by status | Nothing stuck or failed |
| Live database: errors | Postgres and API logs, last 24 hours | Only the outage below and this check's own probes |
| Supabase advisors | Security, performance, health | No action needed (below) |
| Storage | Bucket privacy and size limits | As designed |
| Time | Database and app clock against Winnipeg | Fixed (below) |
| Dependencies | `npm audit` | Low risk; Next.js update (below) |

Not possible from here: signing in to the live site as a real person, real phones, and the
Service Dashboard with the church's equipment. CI covers signed-in journeys against a test
database; real-phone testing is still on the pilot list.

## Broken, and fixed

1. **Planning Center sync down for 22 hours** (9 Nov 21:45 to 10 Nov 19:50 UTC). The sync job read
   a table directly with the service role, which production doesn't allow (HTTP 403). Fixed in
   #237; the first fix then met a second fault (#239): the new check was marked read-only, and the
   function it calls locks a row (HTTP 405). A manual run then succeeded and the 15-minute runs
   continue.
2. **Times an hour early in the database.** Supabase's Postgres still treated Winnipeg as UTC−6 after
   Manitoba moved to UTC−5 all year on 1 November. Reminder emails, notification times, and day
   checks were an hour early. Fixed in #238: a fixed UTC−5 in the app and all 29 database functions
   ([decision](../decisions/2026-11-10-winnipeg-fixed-offset.md)).
3. **Why tests didn't catch item 1.** CI's database granted the service role full table access;
   production grants none. Migration `20270119121600_service_role_like_production` makes CI match
   (no change in production), and pgTAP `088` fails if it drifts.
4. **Why tests didn't catch the second fault in item 1.** pgTAP `088` now fails if any read-only API
   function locks or changes rows, directly or through what it calls.
5. **The weekly summary didn't list the Planning Center sync.** It does now, late after a day without
   a good run.
6. **`/favicon.ico` was a 404.** It now redirects to the app icon.
7. **Next.js 16.4.4.** The Cloudflare adapter's next release refuses it and asks for 16.4.5 or
   later; updated to 16.4.6 in its own PR.

## Checked and left as they are

- **Signed-in users can call 214 database functions; signed-out visitors 14.** By design: every
  function checks permissions itself (SPEC "Authorization lives on the server"). The 14 public ones
  serve public pages or devices holding a token: the wall TV, calendar links, certificate checks,
  phone alerts, keep-alive, and the Serve With Us form.
- **10 tables with row-level security and no policy.** Deny-all on purpose; reached only through
  functions.
- **Leaked-password protection off.** Nobody signs in with a password.
- **135 foreign keys without an index, 27 unused indexes, 4 tables with two read policies.**
  Performance notes only, at this size. Revisit if pages slow down.
- **TV pairing can be called signed out.** By design. At most 20 codes at once, each lasting 15
  minutes, so the worst case is someone delaying TV setup for 15 minutes.
- **An invented calendar token gets an empty calendar.** On purpose, so tokens can't be guessed.
- **A few pages ask the database for permissions while still checking sign-in.** A signed-out visit
  logs a harmless "permission denied" before the redirect; nothing is shown.
- **`npm audit`: 4 high, 12 moderate.** All in build and lint tools (`glob`'s command line inside the
  Cloudflare build, `minimatch`, typescript-eslint, Sentry's build plugin). None runs in the live
  app or on visitor input. npm's suggested fix downgrades the Cloudflare adapter to 0.3, so no.
- **Dependabot security alerts are switched off** for the repository (version updates still run).
  Turning them on is a repository setting: Settings, Code security, Dependabot alerts.

## Still to do (not code)

From the go-live list and the pilot: content and a quiz for the 17 November pilot, the Service
Dashboard equipment, testing on real phones, the Resend key swap, a second Platform Admin, the backup
key offline, and invitations.
