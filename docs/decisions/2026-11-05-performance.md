# Making the app feel faster (G, 2026-11-05)

G asked for a review of what would make the app snappier, then approved the changes below as long as they don't break anything. Each one ships as its own small PR.

## What the review found

The database is not what's slow: most queries take under 30 ms. A call from the app's server took about 85 ms on average, because the server ran in Vancouver and the database is in Virginia, and pages make many calls. Page activity typically came to 20 calls, and often 36 or more.

## Decisions

### The server runs beside the database

`wrangler.jsonc` names `aws:us-east-1` instead of Smart Placement, which had left the server in Vancouver. A visitor's request now makes one longer trip to the server, instead of each database call making one. Static files still come from the nearest Cloudflare location. If the Supabase project ever moves region, this setting moves with it.

After the move, signed-in database calls dropped from 87 ms to 30 ms on average, and the slowest 5% from about 203 ms to 65 ms (Supabase's logs).

### A click shows the next page straight away

The main pages' loading blocks live in `loading.tsx`, so they can appear before the server answers. A `loading.tsx` also covers the pages below it, so `courses`, `courses/[courseId]`, `sops` and `mentoring` keep their own page in a route group, such as `(list)`, so the wrong blocks don't flash first. Add a `loading.tsx` when adding a main page, and keep its blocks shaped like the page.

### Sections of a page share their reads

Learner courses, course summaries, passed quizzes and practicals, and progress are read once while a page is built (`perRequestBatch`, `lib/domain/per-request.ts`). This lasts for one page build only, so nothing is held between visits or people. Cloudflare's free plan allows 50 calls per page, so anything Training reads should use this.

### Left as it is

- **The sign-in key.** The app fetches it close to once per page, and we don't know why. It now takes about 14 ms from beside the database, which doesn't justify changing sign-in.
- **Database indexes.** Supabase suggests 124, but there's too little data for them to help yet. Add them for tables that grow.
