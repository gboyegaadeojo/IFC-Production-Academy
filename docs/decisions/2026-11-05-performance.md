# Making the app feel faster (G, 2026-11-05)

G asked for a review of what would make the app snappier, then approved the changes below as long as they don't break anything. Each one ships as its own small PR.

## What the review found

The database is not what's slow: most queries take under 30 ms. A call from the app's server took about 85 ms on average, because the server ran in Vancouver and the database is in Virginia, and pages make many calls. Page activity typically came to 20 calls, and often 36 or more.

## Decisions

### The server runs beside the database

`wrangler.jsonc` names `aws:us-east-1` instead of Smart Placement, which had left the server in Vancouver. A visitor's request now makes one longer trip to the server, instead of each database call making one. Static files still come from the nearest Cloudflare location. If the Supabase project ever moves region, this setting moves with it.
