# The app updates itself

**Date:** 2026-11-10
**Decided by:** G ("it should work for any phone regardless").

## Why

An app added to an iPhone or Android Home Screen can stay open for days on the version it started with. After a fix went live, G's phone kept showing the Serve page's old layout until the app was closed completely. Nobody should need to know to do that.

## What

- Each build carries its version (the commit, `NEXT_PUBLIC_APP_VERSION` in `next.config.ts`), and `/api/version` says which is live. It's never cached, needs no sign-in, and skips the middleware.
- `components/shell/version-watcher.tsx`, on every page, checks when the app comes back into view and every five minutes. When a newer version is live, it reloads straight away on coming back, unless someone is typing, and otherwise on the next move to another page.
- It never reloads twice for the same version, so a mismatch can't loop.
