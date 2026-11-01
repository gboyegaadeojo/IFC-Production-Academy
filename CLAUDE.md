# IFC Production Academy

A volunteer learning and competency platform for the production ministry at Immanuel Fellowship Church (IFC), Winnipeg. Volunteers join departments, work through three levels, learn from unlisted YouTube lessons and SOPs, pass quizzes and practical assessments, and are approved to serve by a leader.

**The full requirements are in [docs/SPEC.md](docs/SPEC.md).** Read the relevant section before building a feature, and cite requirement IDs (`SRS-…`, `ADD-…`) in commits and PRs. If a request conflicts with the spec, say so instead of silently diverging.

**The user interface follows [docs/DESIGN-REQUIREMENTS.md](docs/DESIGN-REQUIREMENTS.md)**: layout, navigation, visual tokens, components, motion, and accessibility. SPEC.md and this file stay authoritative for behaviour, permissions, and security. The working plan for the redesign is in [docs/design/implementation-plan.md](docs/design/implementation-plan.md).

## Non-negotiable product rules

- **Course completion, competency approval, and Approved to Serve are three separate records.** Watching videos or passing a quiz never makes someone Approved to Serve (SPEC §3, SRS-PROG-007, SRS-COMP-001).
- **Position teams decide who serves; training is shown, never a gate** (decided 2026-10-31). As in Planning Center, each position (serving role) has a team, and a position is filled only from its team, never on a blocked day or in a second position the same day. Team managers add people when they're ready; "Trained" or "Still learning" shows beside each name. A practical that isn't passed is "Not yet", with no waiting period.
- **The system decides results, not people** (decided 2026-10-30). Lessons are completed by the learner, quizzes are scored automatically, and a practical passes when the observer's checklist meets the leader's pass rule; the observer never picks the outcome. A pass grants the competency, and Approved to Serve follows automatically. Leaders publish their own department's curriculum with version history and rollback, with no approval gate.
- **Departments, levels, courses, and rules are data, never code.** No `if (department === 'camera')`. Lighting Operations goes live by changing a status row.
- **Never claim a video was fully watched.** Completion is a learner action; watch % is an informal signal only (SRS-LESSON-006).
- **History is never rewritten.** Progress, quiz attempts, assessments, and certificates link to the content version they were earned on (SRS-CUR-008).
- **Every sensitive admin action writes an audit event** (SRS-AUDIT-001).

## Stack (decided 2026-10-29, target cost $0 a month)

| Concern | Choice |
| --- | --- |
| App | Next.js (App Router) + TypeScript (strict), responsive and an installable PWA |
| Hosting | Cloudflare Workers / Pages via `@opennextjs/cloudflare` (not Vercel: Hobby is personal-use only) |
| Database, auth, files | Supabase Free: Postgres with row-level security, Supabase Auth: Planning Center sign-in for the production team (decided 2026-11-01; server-side OAuth, `docs/runbooks/planning-center-sign-in.md`), and an email magic link for anyone else, Supabase Storage (private buckets, signed URLs) |
| Email | Resend, server-side only; also set as Supabase Auth's SMTP sender |
| Video | Unlisted YouTube via the official IFrame Player API, and the church video library on the UniFi NAS (decided 2026-10-30: streamed by the Worker through a Cloudflare Tunnel after an RLS check; off until the `MEDIA_*` secrets are set, see `docs/runbooks/nas-media.md`). Both sit behind a `VideoSource` abstraction so Vimeo or Mux can be added later |
| Styling | Tailwind CSS driven by the design tokens in DESIGN-REQUIREMENTS §4 (CSS variables in `app/globals.css`, dark theme first) |
| Tests | Vitest (unit), Playwright (end-to-end and PWA), pgTAP or SQL tests for RLS policies |
| Monitoring | Sentry (errors), PostHog (usage), both free tiers |
| Scheduled jobs | GitHub Actions: daily keep-alive, nightly encrypted backup to Google Drive, monthly restore test, weekly summary |

Native iOS and Android apps are Phase 5 (React Native and Expo on the same API). Don't build for them yet, but keep business logic out of React components so it can be reused.

## Architecture rules

- **Authorization lives on the server.** Every table has RLS enabled, with deny by default (SRS-RBAC-004). Server actions and route handlers check permissions as well. Hiding a button is never authorization.
- Permissions are **named capabilities** (`course.publish`, `competency.approve`, `member.approve`…) granted through roles, scoped per department. Check capabilities, not role names.
- Layers: `app/` (routes and UI) → `lib/domain/` (business rules, pure TypeScript, unit tested) → `lib/data/` (Supabase queries). UI never talks to Supabase directly except through `lib/data`.
- All schema changes go through Supabase CLI migrations in `supabase/migrations/`. Never edit the production schema by hand.
- Writes that can be retried (progress, quiz submit) are idempotent (SRS-PROG-004).
- Store timestamps in UTC (`timestamptz`) and display them in America/Winnipeg.
- Use stable UUIDs, never display names, as keys.
- Mentoring private notes have their own RLS policies, separate from shared feedback (SRS-RBAC-006). They are never included in exports.

## Security rules: this repository is PUBLIC

Anyone can read the code, the commit history, and **the GitHub Actions logs**.

- **Secrets only in GitHub Actions secrets** (CI and scheduled jobs) and Cloudflare environment variables (runtime). Never in code, commits, issues, or PR text.
- `.env*` files are gitignored. Commit `.env.example` with placeholder values only.
- The Supabase **anon/publishable** key can be public, because RLS protects the data. The **service-role** key must never reach the browser, the repo, or a log. Use it only in server code and Actions.
- **No real volunteer data in the repo:** no names, emails, photos, or YouTube video IDs or links (unlisted links are shareable secrets, SRS-LESSON-007). Seed and test data must be obviously fake.
- **Actions logs must never contain data.** No `set -x`, no `echo` of secrets or connection strings, no printing query results or row contents. Mask derived values with `::add-mask::`. Log only status, timings, and file sizes.
- **Never upload backups or dumps as workflow artifacts.** They go straight to the Google Drive Shared Drive after `age` encryption. `*.dump`, `*.age`, and `backups/` are gitignored.
- Workflows that use secrets run only on `schedule`, `workflow_dispatch`, or `push` to `main`. Never use `pull_request_target` with secrets. Fork PRs get no secrets.
- Pin third-party actions to a full commit SHA, set `permissions:` to the minimum per workflow, and enable Dependabot for npm and actions.
- The weekly summary commit writes only `status/last-run.json`, containing timestamps, success flags, and backup sizes. No counts of people, no names.

## Scheduled jobs (`.github/workflows/`)

| Workflow | Schedule | Purpose |
| --- | --- | --- |
| `keepalive.yml` | Daily, 18:00 UTC | Real read through the Supabase API so the free project never hits the 7-day inactivity pause. Fails loudly |
| `backup.yml` | Nightly, 08:00 UTC | `pg_dump` (custom format, version matched to Supabase Postgres) plus Storage files → `age` encrypt → upload to the "IFC Academy Backups" Shared Drive via a service account. Retention: 30 daily, 12 weekly, 12 monthly |
| `restore-test.yml` | Monthly | Restore the latest backup into a throwaway Postgres 17 container (Supabase's image) and compare row counts with those taken at backup time. Results go in the log as pass/fail only |
| `notifications.yml` | Every 15 minutes | Queue SOP review reminders, then send pending notification emails through Resend with the service role (Actions secret only). Logs counts only. Sends nothing until `RESEND_API_KEY` and `NOTIFY_FROM` are set; see `docs/runbooks/notifications.md` |
| `planning-center.yml` | Every 15 minutes, and on demand from the Planning Center page | Read Planning Center Services (read-only Personal Access Token, `PCO_PAT_ID` and `PCO_PAT_SECRET`, Actions secrets only) and apply it with `sync_planning_center()` using the service role. Logs counts only. Does nothing until the token is set; see `docs/runbooks/scheduling.md` |
| `weekly-summary.yml` | Weekly | Email G and the Platform Admin via Resend with the last successful runs, then commit `status/last-run.json`, which keeps scheduled workflows enabled (GitHub disables them after 60 days of repo inactivity) |

Any failed job emails G and the Platform Admin via Resend. Details are in SPEC §9.

## Coding conventions

- TypeScript strict and no `any`. Use Zod to validate every input at the server boundary.
- Use server components by default and client components only when interactive.
- Accessibility is part of done: WCAG 2.2 AA, keyboard reachable, visible focus, labels, `prefers-reduced-motion` respected, and colour never the only signal (SPEC §6, §7).
- Use design tokens and never hardcode hex values in components. Use department hues only for covers, icons, rings, and badges. Purple (`--accent`) is the single action colour. Use `--accent-light` for purple text on dark backgrounds.
- UI copy follows SPEC §7 "Writing style": warm, direct, no jargon, no emoji on operational screens.
- Each feature ships with unit tests for its domain rules, RLS tests for any new table, and a Playwright test for its main workflow. The MVP acceptance checklist in SPEC §9 is the bar.
- Use small, focused commits and PRs. Reference SPEC IDs in messages.
- Use conventional names: kebab-case files, PascalCase components, snake_case database columns.

## Build order (SPEC §9 "Delivery phases")

1. **Phase 1, foundation:** app shell, tokens, components, auth, RBAC, users and departments, audit, environments, migrations, keep-alive and backup jobs.
2. **Phase 2, core learning:** curriculum admin and publishing workflow, YouTube lesson player, SOP attachments, progress, quizzes, practical assessments, competency, certificates, dashboards.
3. **Phase 3, ministry operations:** scheduling with competency checks, availability, notifications, mentoring, reports and exports, SOP reminders.
4. **Phase 4, pilot:** Camera Operations Level 1 with a small group.
5. **Phase 5, expansion:** other departments, Lighting, PWA push, calendar, native apps.

Don't start a later phase's features until the earlier phase's exit criteria pass.

### First task: scaffold and foundation

Do this first, as one PR:

1. Create the Next.js + TypeScript (strict) app with Tailwind, ESLint, Prettier, Vitest, and Playwright. Deploy to Cloudflare with `@opennextjs/cloudflare` (`wrangler.jsonc`).
2. Add the design tokens from SPEC §7 as CSS variables (dark theme), with a token preview page at `/dev/tokens` that is only available in development.
3. Set up local Supabase with `supabase init`. Write the first migration: `organizations`, `profiles` (linked to `auth.users`), `departments` (status: active, coming_soon, inactive; hue, icon, order), `department_memberships` (requested, active, declined, removed, with history), `roles`, `capabilities`, `role_capabilities`, `user_roles` (optionally department-scoped), and `audit_events`. Enable RLS on all of them, with tests.
4. Seed the five departments from SPEC §1, with Lighting Operations as `coming_soon`. Seed data must be fake people only.
5. Add sign-in with an email magic link through Supabase Auth, using Resend as SMTP. Include sign-out and a protected `/home` route.
6. Add `.env.example`, a README with local setup steps, a GitHub Actions CI workflow (lint, typecheck, unit, RLS tests; no secrets needed), and `keepalive.yml`.
7. Leave `backup.yml` as a skeleton and finish it once the Google service account and Shared Drive exist. (Done 2026-10-31: off until `BACKUPS_ENABLED`; setup in `docs/runbooks/backups.md`.)

**Done when:** a fake user can sign in, see the five department cards, and request membership; RLS tests prove a volunteer cannot read another department's restricted rows; CI is green.

## Decisions (settled 2026-10-31)

SPEC §9's open decisions are settled in [docs/decisions/2026-10-31-open-decisions.md](docs/decisions/2026-10-31-open-decisions.md): ownership and launch dates, brand, Camera competencies and rubrics ([docs/curriculum/camera-operations.md](docs/curriculum/camera-operations.md)), content, privacy and retention (not needed: no privacy page, retention job, or age rules), reminders, certificates, Planning Center (Planning Center Services schedules and the Academy reads it; the Academy's own scheduler is switched off by `organizations.scheduling_source`), and native apps. Follow them. Quiz answer keys live in the gitignored `private/` folder, never in the repo.
