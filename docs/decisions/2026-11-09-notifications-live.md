# Notifications go live

**Decided by G, 2026-11-09.** Requirement: ADD-NOTIF-02.

## Why

A first group of volunteers starts using the Academy from 2026-11-10. They need their phone alerts
(including instant message alerts) and emails, not just the bell in the app.

## What we decided

- **The launch switch is on,** `organizations.notifications_live = true`, set by
  `20270118120000_notifications_live.sql`. Everyone with an account gets email and phone alerts as
  they've chosen, with quiet hours (20:00 to 08:00) as before.
- **What was held stays held.** Notifications written before today were marked `skipped`, so
  nobody gets old notices.
- **Onboarding emails stay off.** They go to people on a pathway who may not have an account, and
  keep their own switch, `organizations.onboarding_emails_enabled`.
- `notification_testers` stays, in case the switch is turned off again.

## Watch

Resend's free plan allows 100 emails a day, shared with sign-in links. Email is only for people
without phone alerts, and message emails are at most one every 4 hours, so a small group fits well.
Emails over the limit wait for a later run.
