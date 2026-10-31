# IFC Production Academy

Training and readiness for the production ministry at Immanuel Fellowship Church, Winnipeg.
Volunteers join departments, work through three levels, and are approved to serve by a leader.

- Requirements: [docs/SPEC.md](docs/SPEC.md)
- How we build: [CLAUDE.md](CLAUDE.md)

> This repository is public. Never commit secrets, real volunteer data, or YouTube links.
> See "Security rules" in CLAUDE.md.

## Stack

Next.js (App Router, TypeScript strict) on Cloudflare Workers via `@opennextjs/cloudflare`;
Supabase (Postgres with row-level security, Auth, Storage); Resend for email; Tailwind CSS driven
by design tokens; Vitest, Playwright, and pgTAP for tests.

## Local setup

You need **Node.js 24** and **Docker Desktop** (for the local Supabase stack).

```bash
npm ci
npm run db:start          # starts Supabase in Docker, applies migrations and fake seed data
cp .env.example .env.local
npx supabase status -o env
```

Copy `API_URL` into `NEXT_PUBLIC_SUPABASE_URL` and `PUBLISHABLE_KEY` (or `ANON_KEY` on older CLI
versions) into `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in `.env.local`. Then:

```bash
npm run dev               # http://localhost:3000
```

### Signing in locally

Use the email link form. Emails never leave your machine: open **Mailpit** at
<http://127.0.0.1:54324> and click the link. Use port 3000, because links point at
`http://localhost:3000`.

The seed has six obviously fake people you can sign in as:

| Email                         | Role                                   |
| ----------------------------- | -------------------------------------- |
| `avery.volunteer@example.com` | Volunteer, member of Camera Operations |
| `blake.volunteer@example.com` | Volunteer, asked to join Audio         |
| `casey.leader@example.com`    | Department Leader, Camera Operations   |
| `devon.leader@example.com`    | Department Leader, Audio Engineering   |
| `emery.director@example.com`  | Production Director                    |
| `frankie.admin@example.com`   | Platform Administrator                 |

Any other address creates a new volunteer. Sign-in is by email link only (decided 2026-10-30).

Other local tools: Supabase Studio at <http://127.0.0.1:54323>, and `/dev/tokens` for the design
token preview (development only).

## Scripts

| Command                                 | What it does                                                       |
| --------------------------------------- | ------------------------------------------------------------------ |
| `npm run dev`                           | Next.js dev server                                                 |
| `npm run lint` / `typecheck` / `format` | ESLint, TypeScript, Prettier                                       |
| `npm test`                              | Unit tests for business rules (`lib/domain`)                       |
| `npm run test:db`                       | pgTAP tests for row-level security (needs `db:start`)              |
| `npm run test:e2e`                      | Playwright, desktop and mobile (needs `db:start` and `.env.local`) |
| `npm run db:reset`                      | Rebuild the local database from migrations and seed                |
| `npm run db:types`                      | Regenerate `lib/data/database.types.ts` from the local schema      |
| `npm run preview`                       | Build for Cloudflare and run it locally in Workers                 |
| `npm run deploy`                        | Build and deploy to Cloudflare                                     |

If port 3000 is busy, `E2E_PORT=3100 npm run test:e2e` runs the signed-out tests; the sign-in
tests need port 3000 and skip themselves when the local stack isn't running.

## Project layout

```
app/              routes and UI (server components by default)
components/       shared UI components
lib/domain/       business rules: pure TypeScript, unit tested, no Supabase
lib/data/         Supabase queries; the only place the app talks to the database
supabase/
  migrations/     schema changes (never edit production by hand)
  seed.sql        fake local data
  tests/database/ pgTAP tests for RLS
  templates/      auth email templates
e2e/              Playwright tests
.github/          CI and scheduled jobs
```

## Database rules in brief

- Every table has RLS on, and nothing is allowed without a policy. `anon` has no table access.
- Permissions are named capabilities (`member.approve`, `department.manage`…) granted by roles,
  optionally per department. Policies call `private.has_capability(key, department_id)`.
- Departments, roles, and capabilities are data. Lighting Operations goes live by changing its
  `status` to `active`.
- Membership requests and decisions go through `request_membership()` and `decide_membership()`.
  Every change is kept in `department_membership_events`.
- Sensitive changes write to `audit_events`, which cannot be updated or deleted.
- New migrations must enable RLS and grant `authenticated` exactly what their policies need.

## Production setup

Done once by the Platform Admin. Keep every secret out of the repo.

### Supabase (hosted, Free plan)

1. Create the project, then link and push the schema: `npx supabase link` and
   `npx supabase db push`. This creates the organization, departments, roles, and capabilities.
   Never run `seed.sql` against production.
2. **Authentication → URL configuration:** set Site URL to the app's address and add
   `https://<app>/auth/callback` and `https://<app>/auth/confirm` as redirect URLs.
3. **Authentication → SMTP:** host `smtp.resend.com`, port 465, user `resend`, password = a
   Resend API key, sender on a domain verified in Resend. Do this before step 4: the Free plan
   rejects template changes while it uses Supabase's built-in mailer.
4. **Authentication → Email templates → Magic link** (and Confirm signup): use
   [supabase/templates/magic-link.html](supabase/templates/magic-link.html).
5. **First Platform Admin:** sign in once, then grant the `platform_admin` role to that account
   with SQL (an insert into `public.user_roles` with `department_id` null). Everyone after that is
   granted roles in the app.

### Cloudflare

`deploy.yml` builds and deploys on every push to `main` (or run it by hand). `NEXT_PUBLIC_*`
values are inlined at build time; the workflow takes them from the secrets and the `SITE_URL`
variable below. The app never uses the service-role key.

Keep `cacheComponents` off in `next.config.ts`: with it on, the Worker hangs on every request.
CI runs the built Worker in local workerd to catch this.

Create the API token in the Cloudflare dashboard: **My Profile → API Tokens → Create Token →
"Edit Cloudflare Workers" template**, limited to the IFC account.

The church video library (videos on the UniFi NAS) is optional and off until three Worker secrets
are set: `MEDIA_ORIGIN_URL`, `MEDIA_ACCESS_CLIENT_ID`, and `MEDIA_ACCESS_CLIENT_SECRET`. Setup is
in [docs/runbooks/nas-media.md](docs/runbooks/nas-media.md).

### GitHub Actions secrets and variables

| Secret                     | Used by            | Notes                                        |
| -------------------------- | ------------------ | -------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`     | deploy             | "Edit Cloudflare Workers" token, IFC account |
| `CLOUDFLARE_ACCOUNT_ID`    | deploy             | Cloudflare account that owns the Worker      |
| `SUPABASE_URL`             | keep-alive, deploy | Hosted project API URL                       |
| `SUPABASE_PUBLISHABLE_KEY` | keep-alive, deploy | Publishable key; RLS protects data           |
| `RESEND_API_KEY`           | failure alerts     | Sending-only key                             |
| `ALERT_EMAILS`             | failure alerts     | Comma-separated: G and the Platform Admin    |
| `ALERT_FROM`               | failure alerts     | Sender on the verified Resend domain         |

Variable (not secret): `SITE_URL`, the app's public address, for example
`https://ifc-production-academy.<subdomain>.workers.dev`.

The backup job (`backup.yml`) is a skeleton until the Google service account and the
"IFC Academy Backups" Shared Drive exist; its planned secrets are listed in the workflow file.
