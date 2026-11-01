# Sign in with Planning Center

The production team signs in with their Planning Center account (checklist app US-01). Planning
Center governs sign-in; the email link stays under "Use an email link instead" for people who only
want training. A sign-in without Planning Center that has people choose their departments is
planned as the very last piece of work.

## Who gets in

- People in IFC's Planning Center as the sync sees it: on a production team's roster or on a
  schedule. Someone just added in Planning Center can sign in after the next read (15 minutes, or
  **Refresh from Planning Center**).
- Only from IFC's Planning Center organization. The sync records its id.
- The first time, the Academy creates their account quietly (no email) with their Planning Center
  name and primary email, and links it to their Planning Center person. If an account already uses
  one of their Planning Center emails, that account is linked instead. The link is permanent:
  changing their email in Planning Center doesn't matter.
- Suspended or deactivated accounts still can't use the Academy.

## Setup (done 2026-10-31)

1. In Planning Center: **api.planningcenteronline.com/oauth/applications → New application**.
   Redirect URI, exactly:

   ```text
   https://ifc-production-academy.media-5f7.workers.dev/auth/planning-center/callback
   ```

2. Cloudflare secrets (paste each value when asked; never in a chat or a file):

   ```sh
   npx wrangler secret put PCO_CLIENT_ID
   npx wrangler secret put PCO_CLIENT_SECRET
   npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
   ```

Until all three are set, the sign-in page shows the email link only.

## How it works

`/auth/planning-center` sends the person to Planning Center with a one-time state stored in an
httpOnly cookie. The callback checks the state, swaps the code for a token on the server, reads
`/people/v2/me` (with emails) and the organization, and calls `planning_center_sign_in()` with the
service role. The token is used once and never stored or logged. The server then starts an
ordinary Academy session.
