# Hold notifications until launch

**Decided by G, 2026-11-04.** Requirement: ADD-NOTIF-02. **The switch was turned on 2026-11-09**
([decision](2026-11-09-notifications-live.md)).

## Why

G asked that no real volunteer be emailed until the app is finished. Onboarding emails had a hold, but every other notification was emailed as soon as it was queued, because the Resend secrets are set. A volunteer signing in with Planning Center and starting a course could have had a "Keep going" email a week later.

## What we decided

- **One switch for the whole organization,** `organizations.notifications_live`, off until launch.
- **While it's off,** notifications still show in the app, but aren't emailed or sent to devices.
- **Testers are let through,** so the pilot can check real emails. They're listed in `notification_testers`, by account rather than by address, so no address is in this public repository.
- **What's held is never sent later,** so nobody gets a pile of old notices on launch day.
- **It replaces the assignment-only switch** added earlier the same day.

## What it doesn't cover

- **Sign-in links and invitations** come from Supabase Auth, so people can still sign in.
- **Job failure alerts and the weekly summary** go only to G and the Platform Admin.
- **Onboarding emails** keep their own switch, `organizations.onboarding_emails_enabled`, as they go to people who may not have an account. Both need turning on at launch.

How to use it is in [the runbook](../runbooks/notifications.md).
