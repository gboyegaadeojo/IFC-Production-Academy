# The number on the app's icon

**Date:** 2026-11-10
**Decided by:** G, from three mocks (everything unread, only what needs you, a dot with numbers inside).

## Decision

Option A: the Academy's icon shows every unread notification and message added together, like most apps, so the number always matches what people find inside.

## How

- `private.app_badge_count` counts notifications not read or cleared, plus unread messages in chats the person can read and hasn't muted, counted the same way as in Messages. Message notices are left out of the notification count, so a message counts once.
- Alerts carry the number (`push_badges`, called by all three alert senders), so the icon is right when an alert arrives with the app closed. While the app is open it checks again on each page change, on coming back into view, and once a minute (`my_app_badge`).
- The Badging API: iPhone and iPad from iOS 16.4 with the app on the Home Screen and alerts allowed, and installed computer apps. Android's Chrome doesn't show numbers on web app icons; Android shows its own dot when an alert is waiting.
