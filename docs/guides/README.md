# Guides

Plain explanations of each part of the app, for people joining the team and for leaders. Everyone can read them in the app, at `/help`, signed in or not. The list of guides is in `lib/domain/help.ts`.

**Keep these current.** Any change to what someone sees or does updates the matching guide in the same pull request (see "Documentation" in `CLAUDE.md`). After changing a guide or runbook, run `npm run help:build`. A unit test fails if the bundled copy is out of date, if a guide has a broken link, or if a new screen or Admin section has no guide.
