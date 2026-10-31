# Design implementation plan (DESIGN-REQUIREMENTS §0, §11, §13)

Status: Milestones A and B in progress (2026-10-30). Later milestones need review first.

`docs/DESIGN-REQUIREMENTS.md` is the contract for the user interface. `docs/SPEC.md` and `CLAUDE.md` are the contract for product behaviour and security. The redesign changes no schema, RLS, permission check, domain rule, audit event, or publishing rule. One read-only query is added for the learner home page (counts of published courses in a volunteer's departments).

## 1. Inventory of current screens

| Route | Who | Data | Components | Tests | Effect of the redesign |
| --- | --- | --- | --- | --- | --- |
| `/sign-in` | Signed out | `getCurrentUser` | `SignInForm`, `Wordmark` | `sign-in.spec`, `join-department.spec` | Tokens only (A). Full-bleed photo waits for IFC photography (open decision 4) |
| `/invite/[token]` | Anyone | `previewInvitation` | `SignInForm`, `AcceptForm` | `admin.spec` | Tokens only (A) |
| `/home` | Active user | `listDepartmentCards` | `DepartmentCard`, `RequestMembershipButton` | `join-department.spec`, `admin.spec` | **B**: new composition and card states |
| `/profile` | Active user | `getMyProfile` | `DisplayNameForm` | `profile.spec` | New shell and page container (A); restyle in a later milestone |
| `/admin` and its sections | By capability | various `lib/data/admin/*` | `AdminNav`, `ActionForm`, forms | `admin.spec` | **A**: new admin shell (grouped sidebar, mobile drawer). Page contents are restyled in D |
| `/dev/tokens` | Development only | none | token swatches | `sign-in.spec` (hidden in prod) | Updated to the new tokens (A) |

Every membership card state stays: member, requested, can request (first time), can request after decline, can request after removal, coming soon, invite only, and unavailable (filtered out before render).

## 2. Milestone A: foundations and navigation shell

| File | Change |
| --- | --- |
| `docs/DESIGN-REQUIREMENTS.md` | Moved from the repository root (it was uploaded there) |
| `CLAUDE.md`, `docs/SPEC.md` §7 | Point to the design document for visual tokens, so the two documents can't drift |
| `app/globals.css` | DESIGN §4.1 palette (contrast checked), a 3:1 `--border-strong` for form controls (WCAG 1.4.11), DESIGN §4.2 type scale, 12px cards and 8px controls, DESIGN §5 motion durations, page and reading containers |
| `components/ui/button.tsx` | Sizes, quieter weights, pressed state; same variants and API |
| `components/ui/status-badge.tsx` | Refined; same API |
| `components/ui/action-form.tsx` | Fields use `--border-strong` |
| new `components/ui/icons.tsx` | One stroke family (1.75) for menu, close, arrows, chevrons, and checks |
| new `components/ui/card.tsx`, `empty-state.tsx`, `skeleton.tsx`, `page-header.tsx`, `breadcrumbs.tsx` | Shared building blocks (DESIGN §4.4) |
| new `components/ui/drawer.tsx` | Native `<dialog>` drawer: modal focus, Escape, focus return |
| new `components/shell/academy-header.tsx`, `account-menu.tsx`, `admin-sidebar.tsx` | App shell (DESIGN §3): learner header, account menu (Profile, Admin workspace when permitted, Sign out), grouped admin sidebar with "Back to Academy" and a mobile drawer |
| `app/(app)/layout.tsx` | Uses the new header; `main` is no longer capped at 1152px, and pages choose their width |
| `app/(app)/admin/layout.tsx`, `admin-nav.tsx` | Dedicated admin shell; links still come from `adminSections(grants)` |
| `lib/domain/admin.ts` | Each section gets a group (People, Learning, System) for the sidebar; visibility rules unchanged |
| new `lib/domain/people.ts` | `initials()` for avatars (unit tested) |
| `app/dev/tokens/page.tsx` | Shows the new tokens |

The learner header shows only routes that exist (Home). Explore, My Learning, and Resources stay hidden until those pages exist (DESIGN §3.1). The admin "Dashboard" link waits for Milestone D.

Theme: dark only. Light tokens are updated to DESIGN §4.1 but stay off; switching is not supported yet (SPEC open decision 4 puts light theme in Phase 5).

## 3. Milestone B: learner pilot

| File | Change |
| --- | --- |
| `lib/domain/home.ts` (new) | `homeState()`: new, pending, or member, from real memberships; `levelCourseSummary()` (unit tested) |
| `lib/data/departments.ts` | Cards also carry when the membership last changed (request date, join date) |
| `lib/data/learning.ts` (new) | Read-only: published course counts per level in the volunteer's member departments (RLS lets any active user read published titles) |
| `app/(app)/home/page.tsx` | Editorial hero with one primary task per state, request-status panel, "Your departments" with real course counts, a short "how training works" strip that keeps membership, completion, and approval to serve separate, then the department grid |
| `app/(app)/home/department-card.tsx` | Cover area (designed placeholder until IFC photos exist: department line icon, hue rail, mono label, no gradient wash), name, value line, status, exactly one action |
| `supabase/seed.sql` | One obviously fake published course in Camera Level 1, so the "member with courses" state can be tested locally and in CI |
| `e2e/visual.spec.ts` (new) | Screenshots of new, pending, and member states and the admin shell at 390px and 1440px |
| `.github/workflows/ci.yml` | Uploads those screenshots as a short-lived artifact (fake seed data only) |

There is no learner course page yet (Phase 2, step 3), so member cards and "Your departments" show real course counts with "Courses open here soon" instead of a Continue button that would lead nowhere (DESIGN §0 guardrails, §6.1).

## 4. Risks

| Risk | Mitigation |
| --- | --- |
| End-to-end selectors depend on card names, button names, and status text | Keep `article` names, "Request to join {department}", "Request sent", "You're a member", and "Coming soon" wording |
| The admin layout restructure could lose the permission-denied state | Pages still call `getAdminAccess()`; the shell only renders links from `adminSections()` |
| Drawer focus handling | Native modal `<dialog>` handles inert background, Escape, and focus return; a Playwright check opens and closes it |
| No Docker on the development machine | Screenshots and database-backed tests run in CI against the local Supabase stack; the artifact is downloaded and reviewed |
| Wider pages could stretch forms | Reading and form widths stay at about 680 to 880px |
| Brand assets missing | Text wordmark and designed placeholders stay until IFC supplies the logo and photography |
