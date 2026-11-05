# Making the app feel faster (G, 2026-11-05)

G asked for a review of what would make the app snappier, then approved the changes below as long as they don't break anything. Each one ships as its own small PR.

## What the review found

The database is not what's slow: most queries take under 30 ms. A call from the app's server took about 85 ms on average, because the server ran in Vancouver and the database is in Virginia, and pages make many calls. Page activity typically came to 20 calls, and often 36 or more.

## Decisions

### The server stays on Smart Placement, for now

We tried pinning the server beside the database in Virginia (`aws:us-east-1`, #154), then compared it with Smart Placement (#158), which in practice runs in Vancouver. Both are free. The same 200 requests were timed from Winnipeg, 100 on each of two routes, one second apart:

| | Virginia | Vancouver |
| --- | --- | --- |
| Sign-in page, typical | 0.26 s | 0.14 s |
| Sign-in page, over 1 second | 5 of 100 | 0 of 100 |
| Route that skips the app, typical | 0.20 s | 0.12 s |
| Route that skips the app, over 1 second | 3 of 100 | 0 of 100 |
| Signed-in database call, average | About 30 ms | About 90 ms |

Virginia makes pages with many one-after-another database calls faster, but about 1 load in 25 stalled for 1 to 2.7 seconds, and those stalls are what people notice. We kept Vancouver and will win that time back by making fewer one-after-another calls, which also costs nothing. Signed-in pages weren't timed in a browser, and the stalls might be rarer with more traffic. If that changes the picture, this is a one-line setting.

Speed work stays on the free tier (G, 2026-11-05).

### A click shows the next page straight away

The main pages' loading blocks live in `loading.tsx`, so they can appear before the server answers. A `loading.tsx` also covers the pages below it, so `courses`, `courses/[courseId]`, `sops` and `mentoring` keep their own page in a route group, such as `(list)`, so the wrong blocks don't flash first. Add a `loading.tsx` when adding a main page, and keep its blocks shaped like the page.

### Sections of a page share their reads

Learner courses, course summaries, passed quizzes and practicals, and progress are read once while a page is built (`perRequestBatch`, `lib/domain/per-request.ts`). This lasts for one page build only, so nothing is held between visits or people. Cloudflare's free plan allows 50 calls per page, so anything Training reads should use this.

### Mark complete changes on the tap

The button shows the new state straight away and goes back, with a message, if the save fails. Closing the tab in the moment after the tap could lose that one tick, and the person can tap again. Tests that leave the page right after the tap should wait for the "Marked complete." message.

### Error reporting and usage counting load in a quiet moment

Sentry and PostHog download after the page has settled (`whenIdle`, `lib/domain/when-idle.ts`), because they're about 300 KB that nobody waits for on purpose. An error in the first moments of a page may not be reported.

### Left as it is

- **The sign-in key.** The app fetches it close to once per page, and we don't know why. It takes about 25 ms, which doesn't justify changing sign-in.
- **Database indexes.** Supabase suggests 124, but there's too little data for them to help yet. Add them for tables that grow.
