# Notification emails

The Academy writes a notification when something happens for a person: joining a department,
being scheduled, a practical assessment result, a mentoring pairing, or an SOP they own coming
due for review. Everyone sees theirs in the app under **Notifications** (the bell beside their name), and
chooses which kinds reach their phone and their email.

## What they look like

Every email uses the Calm design in `lib/domain/email-design.ts`: the app's current logo (served at
`/brand/icon`, so a new logo shows even in emails already sent), the title as the subject, the
message as the inbox preview, a details box where it applies, and one button named for what it does
(`emailButtonLabel`).

The details box (when, role and service; a course and its length; due and expiry dates) and a
shorter line for phone alerts are looked up as each notification is written, from what its dedupe
key names (`private.add_notification_details()`). If nothing is found, the email has no box and the
alert uses the message. Sign-in emails use the same design, sent by the app.

## Sign-in emails

Supabase makes the one-time sign-in token, then calls the app's `/api/auth/send-email` through
its **Send Email hook**. The app checks Supabase's signature, builds the email
(`lib/domain/auth-email.ts`), and sends it through Resend. So sign-in emails have the same design
as everything else, and nothing is pasted into Supabase.

- Secrets: `SEND_EMAIL_HOOK_SECRET` (GitHub Actions), plus `RESEND_API_KEY` and `NOTIFY_FROM`.
  The deploy copies all three into Cloudflare.
- The hook: Supabase → Authentication → Hooks → Send Email, type HTTPS, URL
  `<site>/api/auth/send-email`, with the same secret.
- If the app or Resend can't send, Supabase shows the person an error and nothing is sent, so they
  can try again or use Planning Center sign-in.
- **Local development** doesn't use the hook: Supabase sends with
  `supabase/templates/magic-link.html` into Mailpit, as before.
- **To switch it off,** turn the hook off in Supabase. Supabase then sends with its own template.

## Which way each one travels

Set in `private.route_notification()`, and decided in `docs/decisions/2026-11-05-alerts.md`:

- **In the app:** everything.
- **App only:** a certificate ready, a new course, and an updated SOP.
- **Phone alert:** everything else, on devices with alerts on, unless the person turned that kind off.
- **Email:** if the person has no alerts on a phone, or turned that kind off for their phone, and as
  they've chosen. A moved or cancelled service comes by email as well as by alert.

### Messages: instant phone alerts (ADD-MSG-06)

Message alerts don't wait for the job. When someone sends a message, the Worker replies first, then
(with `after`, so sending is never slower) calls `claim_message_alerts()` with the service role and
sends the alerts with the VAPID keys. Both are Cloudflare secrets already set for other alerts
(`SUPABASE_SERVICE_ROLE_KEY`, `VAPID_PRIVATE_KEY`, and the public key `NEXT_PUBLIC_VAPID_PUBLIC_KEY`).

- **Who:** people who can read the chat, have alerts on a device, haven't muted it, haven't read it
  in the last 30 seconds (an open chat refreshes this every 15), and have **Messages** on for their
  phone. Not the sender.
- **How often:** one alert per chat, with the same tag, so a new one replaces the last on the device
  ("4 new messages in Camera Operations"), and at most one every 20 seconds per person per chat.
- **Privacy:** a direct message alert says who it's from, never the words. Group and department chat
  alerts show the start of the message.
- **Rules that still apply:** the launch switch (on since 2026-11-09) and nothing while messaging
  is off. There are no quiet hours (removed 2026-11-09).
- **Logs:** counts only ("Message alerts: 3 sent, 0 devices gone, 0 failed"), in the Worker's logs.

The 15-minute job still writes message notices for the bell. `private.route_notification()` keeps
them off phones, so nobody gets a second alert for the same messages, and **never emails them**
(G, 2026-11-09: `20270118120100_no_message_emails.sql`). The settings page offers only a Phone
choice for Messages.

Emails are sent every 15 minutes by `.github/workflows/notifications.yml`, which runs
`scripts/send-notifications.ts`. A Cloudflare timer starts it, because GitHub's own schedule can run
hours late ([how it works](scheduling.md#starting-jobs-on-time)). Until the secrets below are set,
nothing is emailed and notifications stay in the app. The secrets are set and the launch switch
below is on, so **everyone gets email and alerts as they've chosen.**

## Secrets (GitHub → Settings → Secrets and variables → Actions)

| Secret | What it is |
| --- | --- |
| `SUPABASE_URL` | Already set for the keep-alive job |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API keys → service role. Only ever an Actions secret: never in the app's runtime, the browser, the repo, or a log |
| `RESEND_API_KEY` | Already set for failure alerts |
| `NOTIFY_FROM` | The sender, for example `IFC Production Academy <academy@your-domain>`, on a domain verified in Resend |

The Academy's address for links in emails comes from the `SITE_URL` repository variable the
deploy workflow already uses.

## What the job does

1. Queues reminders (`queue_sop_review_reminders`, `queue_reminders`, `queue_serving_reminders`,
   and `queue_cover_reminders`), each once:
   - SOP review due a week before the review date, and overdue a week after it;
   - "Please confirm" 48 hours after someone is scheduled, if they haven't answered;
   - "Serving soon" from 10:00 two days before an event, to the confirmed volunteer, and to their
     supervisor for the Academy's own services;
   - "Serving today" from 08:00 on the day;
   - "Still to start" 7 days after a course is assigned, if they haven't started it;
   - "Keep going" 7 and 21 days after someone last worked on a course they started;
   - a practical assessment request still open after 7 days, to the department's leaders;
   - a competency expiring within 30 days, where expiry is on;
   - a cover request still open within two days of the service, to those who schedule.

   These cover Planning Center's services too, so some people also get Planning Center's own
   reminders. G chose that, in `docs/decisions/2026-11-05-alerts.md`. Learning reminders (the nudges
   and "Still to start") are limited to one a day per person, and a skipped one is written on a later
   day. An assessment request also notifies the department's trainers the moment it's made.
   Times follow decision 8 in `docs/decisions/2026-10-31-open-decisions.md`.
2. Claims up to 50 pending emails at a time (`claim_email_notifications`), skipping kinds the
   person turned off and accounts that aren't active.
3. Sends each through Resend and records the result (`complete_email_notification`). A failed
   send is retried on the next runs, up to three attempts.
4. Sends onboarding pathway emails the same way (`claim_onboarding_emails`,
   `complete_onboarding_email`), if onboarding emails are on. See below.

**There are no quiet hours** (G, 2026-11-09, `20270118120200_no_quiet_hours.sql`). Emails and
alerts go out at any time of day; until then they were held from 20:00 to 08:00 Winnipeg time.
`private.alerts_held_now()` is where a hold would go back if it's ever wanted.

The job logs counts only: no addresses, names, or content. If every send in a run fails, the job
fails and the failure alert emails the admins.

## The launch switch

**On since 2026-11-09** (`20270118120000_notifications_live.sql`), as the first volunteers start:
everyone gets email and phone alerts as they've chosen. Decided in
`docs/decisions/2026-11-09-notifications-live.md`.

While `organizations.notifications_live` is false, notifications still show in the app, but aren't
emailed or sent to devices. Each one is marked `skipped` as it's written, so **it's never sent
later**. What was held before 2026-11-09 stayed held.

People in `notification_testers` are let through while it's off, so a pilot can check real emails.
Add them by account in the Supabase SQL editor, and never put their addresses in this repository:

```sql
insert into public.notification_testers (user_id)
select id from auth.users where email = 'someone@example.com';
```

To hold everything again (testers still get theirs):

```sql
update public.organizations set notifications_live = false;
```

This switch doesn't affect sign-in links, or the job alerts and weekly summary that go to the
admins. Onboarding emails have their own switch, below.

## Onboarding emails

These go to people on a pathway, who may not have an account yet. **On since 2026-11-09**
(`20270118120200_no_quiet_hours.sql`): new emails are written to `onboarding_outbox` as `pending`
and go out on the next run.

While `organizations.onboarding_emails_enabled` is false, each email is written as `held` and
nothing is sent. To hold them again, set it to false.

- **Emails held before 2026-11-09 stay held.** They aren't sent when you switch on, so nobody gets a
  welcome written for them weeks ago. Look through them and contact anyone who still needs one.
- **Someone whose account is suspended or deactivated isn't emailed.** Their email is marked
  `skipped`.
- **People without an account are told to reply** if they'd rather not get these, so someone must
  read the `NOTIFY_FROM` inbox.

## Check it works

- Run the workflow by hand (Actions → Notifications → Run workflow) and look for
  `Notification emails: N sent, 0 failed`.
- Do something that notifies you, wait for the next run, and check the email arrives with a link
  back to the Academy.

## Resend's limits

The free plan allows 100 emails a day and 3,000 a month, shared with sign-in links, and 2 requests a second. The sender waits between emails. When Resend says it's at its limit, the rest stay in the queue and go out on a later run, without using up a try. Any other failure gets 3 tries, and the job fails loudly so you're told.
