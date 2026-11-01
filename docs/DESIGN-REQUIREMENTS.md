# IFC Production Academy
# Premium UI/UX Design Requirements & Implementation Specification
**Version:** 2.0 | **Date:** 30 October 2026 | **Status:** Implementation-ready design direction, subject to visual approval  
**Product:** Immanuel Fellowship Church Production Academy, Winnipeg  
**Audience:** Claude Code, frontend developers, designers, QA, ministry leadership  
**Repository:** https://github.com/gboyegaadeojo/IFC-Production-Academy

> **Authority and scope:** This document governs the presentation layer, navigation, content hierarchy, visual identity, interaction, and accessibility. Existing `docs/SPEC.md` and `CLAUDE.md` remain authoritative for product behaviour, permission checks, assessment rules, security, and data handling. Where a proposed design implies functionality not yet implemented, label it as future-state and show a genuine empty state; do not fabricate data or silently implement new business logic.

---

## 0. Instructions to Claude Code — READ FIRST

You are the principal product designer, senior frontend engineer, and accessibility lead. Your assignment is to **redesign the experience, not rewrite the application**. The outcome must feel like a deliberately art-directed, professional production-training platform: immersive for learners, precise for administrators, coherent on mobile, and distinctly IFC.

### Required working sequence
1. Read `CLAUDE.md`, `docs/SPEC.md`, `app/globals.css`, `app/layout.tsx`, and the relevant route/component files. Inspect existing design-token and UI components before changing anything.
2. Inventory **every current screen and UI state** and record routes, user roles, data dependencies, components, existing tests, and the effect of redesigning them.
3. Produce a **visual implementation plan** identifying component changes, new components, and risk areas. Do not remove capabilities or bypass permissions.
4. Implement the design foundation and shared app shell first.
5. Build **one complete vertical slice**: signed-in volunteer home, department card, pending membership state, and responsive navigation. Capture screenshots at desktop and mobile sizes. Compare them against the criteria below; fix deficiencies before propagating the system.
6. Implement the remaining screens incrementally, grouped by learner and administration experience. Never replace real content with hard-coded example content.
7. Run formatting, lint, typecheck, relevant unit/integration/E2E tests, and Playwright visual checks. Document which checks passed and which could not run.
8. Provide a change log, screenshots, and any unresolved issues. Do not call the redesign complete until acceptance criteria are checked.

### Guardrails
- Do not change Supabase schemas, RLS, authentication, authorization, domain logic, audit behaviour, assessment computation, or course publication rules merely for visual convenience.
- Do not add unrelated dependencies without justification; CSS and existing Tailwind should handle most motion.
- Do not present unimplemented controls as if they work.
- Do not use generic gradients, random icons, placeholder analytics, or stock imagery as permanent production assets.
- Do not modify published curriculum or real user records while testing.
- If screenshots/reference mockups are supplied later, treat them as visual targets and explicitly reconcile any conflict with this document.

---

## 1. Product vision and success definition

**Positioning:** A professional academy where church production volunteers discover their craft, learn real equipment, practice under guidance, and understand when they are qualified to serve.

**Experience split:**
- **Learner:** video-first, visually rich, motivating, calm, editorial, personalized.
- **Leader/administrator:** operationally efficient, structured, accessible, information-dense without clutter.
- **Shared:** same brand, tokens, typography families, controls, status language, responsive standards.

**Core user questions answered within five seconds:**
- New volunteer: “What can I learn and how do I join?”
- Pending volunteer: “What is the status of my request?”
- Enrolled learner: “Where do I continue and what is next?”
- Evaluator: “Who needs assessment and what do I record?”
- Leader: “What requires my attention?”
- Director: “What is the training/readiness situation?”
- Admin: “Where do I manage access and settings?”

**Definition of success:** visually distinctive academy, not a default admin template; navigable with keyboard and touch; accurate and explainable status; no regression in core workflows; realistic empty states; screenshot-reviewed at multiple viewports.

---

## 2. Design inspirations and interpretation

| Reference | Borrow | Do not copy |
|---|---|---|
| MxU (getmxu.com) | Production-specific course storytelling, role-based training, relevant imagery, lesson sequence | Branding, proprietary images, exact layouts |
| MasterClass | Cinematic course covers, editorial typography, clear content-led discovery | Entertainment-oriented distractions |
| Linear | Refined admin navigation, active states, dense tables, subtle motion | Issue-tracker jargon or unnecessary complexity |
| Apple | Spacing discipline, deliberate motion, clear focus, high-quality responsive layout | Excessive blur, translucent surfaces, ornamental effects |

**Creative principle:** Let real production photography, course content, typography, and thoughtful composition create the premium feeling. A purple button and gradient are not a visual identity.

**Preferred imagery:** Real IFC camera positions, Blackmagic cameras/ATEM, Behringer X32, ProPresenter workstation, lighting desk, production booth, worship service, and volunteers (with appropriate consent). Images should depict authentic production tasks. Do not imply endorsement from equipment vendors. Use a consistent editorial treatment with restrained dark overlays and accurate alt text. If real assets are unavailable, show neutral, intentionally designed placeholders—not fake photos or fabricated courses.

---

## 3. Information architecture and navigation

### 3.1 Learner navigation
Primary: **Home**, **Explore**, **My Learning**, **Resources** (only when implemented/available). Secondary: notifications, profile, account, and admin workspace (permission-gated). Do not expose dead destinations. For the initial product, hide or disable future navigation until real routes and content exist.

**Desktop:** compact top bar with IFC Academy wordmark; persistent or collapsible learner sidebar only if navigation complexity justifies it. Keep main content generous, not confined to the existing `max-w-6xl` for all screens. Search appears only when functional.

**Mobile:** 44px minimum interactive targets; compact top header, accessible menu/drawer; optionally bottom navigation for 3–4 high-frequency learner destinations if implemented. Never use a desktop sidebar squeezed into a mobile viewport.

### 3.2 Admin navigation
A dedicated admin shell (revised 2026-11-01). In Admin, the sidebar replaces the Academy's top header.

- **Desktop (1024px and up):** a full-height sidebar, 256px wide or 72px icons only. The choice is remembered on the device. It has three fixed parts: the brand and the icons-only switch; the **workspace switcher** (Administration, Academy); and the account menu in the footer (Profile, Notifications, Mentoring, Appearance, Sign out). The navigation between them scrolls on its own.
- **Groups**, each with one icon, opening and closing (several at once). The current page's group opens by itself; open groups are remembered on the device.
  - **Overview:** Dashboard
  - **Checklists:** Task lists, Activity log, Service history, Hidden items, Checklist settings
  - **Services & Scheduling:** Planning Center, Serving teams, Schedule
  - **Training Academy:** Curriculum, SOP library, Assessments, Competencies and roles, Membership requests, Mentoring, Departments, Reports
  - **People & Teams:** People and roles, Invitations
  - **System & Settings:** Audit log
- **Icons only:** each group's icon opens a flyout of its pages on hover, click or Enter. Escape closes it and returns focus.
- **Below 1024px:** a slim bar with the current page; its menu opens the same sidebar in the drawer.
- Only show links authorized by existing capabilities. The current item uses a subtle surface highlight, stronger text, and a narrow purple bar, never a harsh full outline. **Badges only for real counts** (pending membership requests, people in unlinked Planning Center positions), none at zero. 14px labels, 18px icons, 36–44px rows, 150–200ms transitions that stop under reduced motion.

### 3.3 Breadcrumbs and context
On deep screens use compact breadcrumbs, department context, and a single clear page title. Avoid repeating introductory prose on every visit; move longer explanations into contextual help or an information panel.

---

## 4. Visual design system

> **Updated 2026-11-01 (new look, approved by G in the "Academy New Look Mock").** Light is now the default theme: a lavender-white canvas, white cards, one purple action colour, soft amber and green status pills, and pastel icon tiles in the admin sidebar, inspired by IFC's Church Budget app. Dark stays available with the same accents. Type is **Inter** (Geist Mono for small labels), two steps smaller: body 14px, small 12px, display 26–32px. Learner pages keep the top bar; only Admin uses the sidebar. The exact values and their contrast checks live in `app/globals.css`; where this section's tables differ, `globals.css` wins.

### 4.1 Colour tokens
Dark is the signature theme; design an equally intentional light theme and respect system preference if theme switching is supported.

| Token | Dark | Usage |
|---|---|---|
| `--bg` | `#000000` | Main canvas (true black, G 2026-11-01) |
| `--surface` | `#0A0A0A` | Header, navigation |
| `--card` | `#141414` | Cards, panels |
| `--hover` | `#222222` | Hovered interactive surfaces |
| `--border` | `#2A2A2A` | Separators |
| `--text` | `#F5F5F5` | Primary text |
| `--text-secondary` | `#B4B4B4` | Secondary content |
| `--text-muted` | `#929292` | Metadata, never essential information below contrast requirements |
| `--accent` | `#7C3AED` | Primary actions |
| `--accent-light` | `#B69BFF` | Accessible links and focus accents |
| `--on-accent` | `#FFFFFF` | Button text |

Light palette proposal: canvas `#F7F8FA`, surface `#FFFFFF`, card `#FFFFFF`, hover `#F0F1F5`, border `#E1E3E9`, primary text `#171820`, secondary `#515563`, accent `#6D28D9`. Test actual foreground/background contrast before shipping.

Department identity: Camera `#4F8CFF`, Audio `#2BD4A4`, Graphics `#B07CFF`, Directing `#FF6B57`, Lighting `#FFC23D`. Use these as **minor** accent colours on icons, rails, covers, tags, and progress; never create five competing primary button colours. Status colours must never be the sole status indicator.

### 4.2 Typography
Keep IBM Plex Sans and IBM Plex Mono initially to minimize churn; evaluate Geist/Inter as an alternative display face only after visual comparison. Use Plex Mono sparingly for timecodes, technical identifiers, small uppercase labels, and equipment tags.

- Hero 36–48px desktop / 28–34px mobile; line-height 1.1–1.2.
- Page title 28–32px desktop / 24–28px mobile.
- Section heading 20–24px; card title 16–20px.
- Body 14–16px, line-height 1.5–1.65.
- Metadata 12–13px where contrast allows.
- Use 400/500/600 weights; avoid everything bold.
- Limit long prose to roughly 65–75 characters per line.
- Do not make headings smaller just to cram more content onto screen.

### 4.3 Spacing and geometry
Use 4px base increments with an 8px dominant rhythm: 4/8/12/16/24/32/40/48/64. Content width: learner browse up to 1440px, admin up to 1440px, reading and forms typically 680–880px. Typical desktop page gutters 32–48px; mobile 16–20px. Card radius 12px, inputs/buttons 8–10px, pills fully rounded. Border subtle; avoid heavy drop shadows in dark mode. Use 16:9 or 3:2 for training imagery and consistent card image aspect ratios.

### 4.4 UI components
Build/standardize: `AppShell`, `AcademyHeader`, `AccountMenu`, `AdminSidebar`, `PageHeader`, `Breadcrumbs`, `Button`, `IconButton`, `Card`, `CourseCard`, `DepartmentCard`, `ProgressIndicator`, `StatusBadge`, `EmptyState`, `Skeleton`, `Dialog`, `Drawer`, `Tabs`, `FormField`, `Select`, `DataTable`, `Toast`, `ConfirmDialog`, `ActivityItem`, `CoursePathway`, `LessonList`. Adapt existing components rather than creating duplicates. Use icons consistently (one family, matching stroke width). Prefer descriptive text to mystery icons.

### 4.5 States
Every interactive component must have: default, hover (where applicable), focus-visible, active/pressed, disabled, loading, error, success, and empty states as appropriate. Provide actionable inline validation, not only a toast. Never use colour alone to indicate selection, progress, or error.

---

## 5. Motion and interaction rules

Motion must explain navigation, status, or completion—not decorate the screen.

| Interaction | Duration | Behaviour |
|---|---|---|
| Hover/focus | 120–180ms | Surface or border transition, no jitter |
| Card hover | 160–200ms | Subtle background shift; imagery scale max ~1.02 |
| Sidebar selection | 150–200ms | Active highlight and indicator |
| Drawer/dialog | 180–240ms | Opacity plus small translation; managed focus |
| Page content entry | 180–240ms | Optional opacity and <=6px translation |
| Progress completion | 220–350ms | One subtle success confirmation |
| Loading | Contextual | Skeleton aligned to final layout |

Use a standard ease-out curve such as `cubic-bezier(.2,0,0,1)`. No perpetual floating elements, flashing borders, staggered animation on large tables, confetti for routine actions, or exaggerated spring physics. Honour `prefers-reduced-motion` by removing spatial transitions and decorative motion while retaining clear state changes.

---

## 6. Screen requirements — learner experience

### 6.1 Home (`app/(app)/home/page.tsx`)
**Goal:** Show the next meaningful action and the available learning world.

**New volunteer:** compact editorial hero, introductory line, prominent “Explore departments”, rich department cards, clear explanation of training versus approval to serve in a short informational section.

**Pending enrollment:** compact request-status panel with department, date, and pending state; other departments remain discoverable.

**Enrolled learner:** “Continue Learning” first when course content exists; current course title, level, lesson, progress, primary “Continue” action; then My Departments and recommended next steps. Do not show fictitious progress when no curriculum exists.

**Advanced learner:** advanced courses, mentoring and assessment actions only where supported.

**Composition:** 1 clear hero or primary task, 1 featured learning card, secondary content grid. Avoid a page of five identically weighted panels. Show real data and robust empty states. On desktop, 2–3 cards per row; mobile, 1 card per row.

**Acceptance:** at least four meaningful states render correctly: new, pending, enrolled/no courses, enrolled/with courses. CTA wording matches actual capability.

### 6.2 Department discovery (`app/(app)/home/department-card.tsx`)
Replace coloured top gradients and boxed generic icons with image-led cards using real IFC department cover assets where available. Each card includes: cover/placeholder, name, concise value proposition, enrollment status, and exactly one clear next action. Keep consistent height where possible, but do not truncate essential statuses. Requested, member, invite-only, coming-soon, declined/retry, and unavailable must remain distinct. If the department is a member, primary action should enter available learning, not show only a success badge.

**Acceptance:** status text is unambiguous, card keyboard accessible, and all seven existing state variants remain supported.

### 6.3 Department detail and three-level pathway (future-state if not yet implemented)
Header with image, role summary, membership and readiness status; Level 1 Foundations, Level 2 Proficiency, Level 3 Advanced & Leadership as clear connected stages. Each stage includes actual course count, progress, requirements, lock/prerequisite reason, and next action. Level completion is **not** equivalent to Approved to Serve. Provide separate status area for practical competency and serving authorization.

### 6.4 Course landing and lessons (future-state where necessary)
Cinematic cover, title, learning objectives, actual duration if available, instructor/owner where supported, level, lessons, prerequisites, resources, and start/continue CTA. Avoid fabricated teacher portraits, ratings, or time estimates.

### 6.5 Lesson player
Desktop: 16:9 video as dominant content, collapsible lesson list alongside, tabs or sections for Overview, Resources, Notes (only if implemented), and accessible next/previous controls. Mobile: video first, lesson list in a drawer or accordion, readable resources below. Display last playback position only if supported. Use a clearly labelled learner-controlled “Mark Lesson Complete” action; never claim full watch verification from YouTube. Handle video errors, missing embeds, unavailable resources, and slow connections. Keep unlisted video IDs out of public repository assets and logs.

### 6.6 Quizzes and practical assessments
Quiz: one question at a time or clear grouped flow, progress, explicit answer selection, validation, submission confirmation, pass/fail feedback based on configured rules, retry availability. Practical assessment: observable rubric checklist, criterion-specific notes, clear evaluator identity, and **system-calculated outcome**. Observer cannot manually choose Pass. Clearly separate lesson completion, competency record, and Approved to Serve status.

### 6.7 Learner profile, certificates, resources, schedule, mentoring
Apply the shared design system to existing pages; for planned features, define templates but do not build fake workflows. Certificates are earned, version-linked, and never issued based on visual progress alone. SOPs and mentoring notes respect existing access policies.

---

## 7. Screen requirements — administration

### 7.1 Overview dashboard (new UI; metrics must be real)
Introduce an admin landing page rather than redirecting directly to membership requests. Show an action queue first: pending requests, content drafts awaiting attention, assessment queue where supported. Then a restrained metric row showing only counts backed by real queries. Provide quick navigation to primary tasks. When a metric cannot be derived, omit it rather than inventing values. Respect department-scoped capabilities.

### 7.2 Membership Requests (`app/(app)/admin/members/page.tsx`)
Convert raw rows to a review inbox with pending/approved/declined filtering where data supports it. Each entry: volunteer name/avatar initials, department, request date, status, optional note, clear Approve/Decline. Do not put an always-visible optional input across every row; open a focused detail panel or inline expansion. Decline and remove actions need deliberate confirmation where destructive. Clarify that approval gives access to training, **not** serving authorization. Retain audit events and decision actions.

### 7.3 Invitations (`app/(app)/admin/invitations/page.tsx`)
Use a focused form with department selector, segmented single-person/group invitation choice, expiry, optional note, and strong primary “Create invitation link” action. Successful creation displays a copyable link and QR code when supported, with usage and expiry details. Show a compact history table with status and revoke. Do not expose or log invitation tokens unnecessarily.

### 7.4 Curriculum (`app/(app)/admin/curriculum/page.tsx`)
**High priority:** Replace a long repeated list of all departments and all three levels with a department selector and a focused three-stage curriculum workspace. Each level shows real courses, status, ordering, and an “Add course” action. Add empty-state guidance: “No courses in Level 1 yet” + a primary action. Avoid making every row equally prominent. Provide clear draft/published badges, version history, preview, rollback, and permission-aware publishing in the existing course editor. Maintain content versioning and departmental publishing rules.

### 7.5 Course editor (`app/(app)/admin/curriculum/[courseId]/page.tsx`)
Design a structured authoring layout: Overview, Lessons, Assessment, Resources, Publishing (tabs or left subnav). Persistent save/publish status, clear draft versus published, inline validation, sortable lesson list if implemented, safe navigation with unsaved changes. Do not add autosave unless the backend supports it; never imply changes are saved when they are not. Use real action permissions.

### 7.6 People & Roles (`app/(app)/admin/people/page.tsx`)
Searchable people directory with initials/avatar, display name, email, roles, account status, and joined date. On click, a detail screen organizes identity, roles, department memberships, and activity. Role management must distinguish platform-wide from department-scoped grants. Avoid confusing membership, role, competency, and Approved to Serve. Do not allow accidental privilege escalation via the UI.

### 7.7 Departments (`app/(app)/admin/departments/page.tsx`)
Use a structured list/table: icon, department name, enrollment mode, status, and action. Edit in a focused form or drawer; changing active/paused/coming-soon requires an accurate description of consequences. Do not delete training history. Retain department identity hues and configurable data model.

### 7.8 Audit Log (`app/(app)/admin/audit/page.tsx`)
Use a compact timeline or table with event title, actor, subject, department, timestamp (Winnipeg time), and expandable detail. Filters and search only when supported by real query semantics. Events remain immutable; never offer edit/delete. Sensitive details should not be surfaced to unauthorized roles.

### 7.9 Empty/loading/error states across admin
No-members, no-invitations, no-courses, no-requests, and no-audit-results states must have useful contextual messages. Do not show long lists of empty departments. Skeletons should match the final layout; errors should identify what failed and provide safe retry where appropriate.

---

## 8. Responsive specification

| Viewport | Layout |
|---|---|
| 360–479px | Single-column cards, 16px gutters, menu drawer, full-width forms, video-first lesson layout |
| 480–767px | Single or two-column where content fits, no horizontal overflow |
| 768–1023px | Two-column learning grid, compact/collapsible navigation, readable admin forms |
| 1024–1439px | Desktop admin sidebar, 2–3-column learning grids, lesson sidebar |
| >=1440px | Generous editorial layout with constrained reading widths, no stretched form fields |

Test 390x844, 768x1024, 1024x768, and 1440x900 at minimum. Ensure dialogs fit small screens, tables can scroll horizontally only inside their own container, and sticky elements do not cover content. Test zoom at 200%.

---

## 9. Accessibility and usability

Target WCAG 2.2 AA. Maintain semantic headings, labels, descriptive button names, keyboard reachability, visible focus rings, correct modal focus trapping/return, skip link, alt text for informative images, empty alt for decorative images, status text in addition to colour, and accessible errors. Aim for 4.5:1 normal text and 3:1 large text/non-text UI indicators where applicable. Touch targets should be at least 44x44px for primary touch controls. Avoid focus loss during server updates. Announce asynchronous success/failure appropriately without excessive screen-reader noise.

---

## 10. Data integrity and security boundaries

Do not alter:
- `docs/SPEC.md` product requirements without a separately justified change.
- RLS, authorization checks, audit events, or membership/role policies.
- Course completion, quiz scoring, system-calculated practical outcomes, competency grants, or Approved to Serve logic.
- Version linkage for historical completions, certificates, or assessments.
- Unlisted YouTube content security assumptions; unlisted is not private access control.
- Private mentoring note permissions.
- Actual database content, production user records, or invitation tokens in screenshots.

Never make a design shortcut that confuses **membership approved**, **course completed**, **competency approved**, and **approved to serve**.

---

## 11. Implementation map

| Existing file | Intended change |
|---|---|
| `app/globals.css` | Refine tokens, typography, component utilities, motion and responsive foundations |
| `app/layout.tsx` | Preserve font loading, metadata, skip link, root semantics; refine as needed |
| `app/(app)/layout.tsx` | Replace simplistic header with contextual, responsive app shell |
| `app/(app)/home/page.tsx` | Personalized learner home composition and states |
| `app/(app)/home/department-card.tsx` | Photography-led, status-aware cards |
| `app/(app)/admin/layout.tsx` | Distinct responsive admin shell |
| `app/(app)/admin/admin-nav.tsx` | Grouped, capability-aware navigation |
| `app/(app)/admin/page.tsx` | Genuine overview dashboard backed by real data |
| `app/(app)/admin/members/page.tsx` | Review inbox |
| `app/(app)/admin/invitations/page.tsx` | Structured invitation workspace |
| `app/(app)/admin/curriculum/page.tsx` | Department-focused pathway editor |
| `app/(app)/admin/curriculum/[courseId]/page.tsx` | Refined course authoring workspace |
| `app/(app)/admin/people/page.tsx` | Searchable directory |
| `app/(app)/admin/departments/page.tsx` | Structured management |
| `app/(app)/admin/audit/page.tsx` | Compact activity history |
| `components/` | Consolidated reusable UI components; avoid duplication |

Before editing, check each file against current `main`; paths and implementation details may evolve. Reuse existing actions and data queries wherever possible.

---

## 12. Acceptance criteria / definition of done

**Visual quality**
- [ ] Homepage no longer resembles five generic gradient cards.
- [ ] Learner pages visibly prioritize actual training content and next actions.
- [ ] Admin pages are cohesive, compact, and easy to scan.
- [ ] Brand, typography, colours, and spacing are consistent.
- [ ] Real imagery or tasteful placeholders, not random permanent stock photos.
- [ ] Empty states are designed, not blank gaps or generic “No items yet.”

**Functionality and correctness**
- [ ] All existing department membership states work.
- [ ] Invitation creation, copy/QR, expiry and revocation remain correct where implemented.
- [ ] Curriculum drafts, publishing, versions, and rollback remain correct.
- [ ] Roles and permissions remain enforced server-side.
- [ ] Audit events still record sensitive actions.
- [ ] Course progress, competency, and Approved to Serve remain distinct.
- [ ] No fake metrics, fake lessons, or dead buttons.

**Interaction and accessibility**
- [ ] Keyboard-only workflows are usable.
- [ ] Focus is visible; dialogs/drawers manage focus.
- [ ] Contrast, touch targets, labels, and errors meet standards.
- [ ] Reduced-motion preference is honoured.
- [ ] Desktop/mobile layouts have no unintended overflow.
- [ ] Loading/error/empty states exist for each data-driven view.

**Verification**
- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm test`
- [ ] Relevant `npm run test:e2e` suites, with blockers documented.
- [ ] Screenshots captured at 390px, 768px, 1024px, and 1440px.
- [ ] Side-by-side visual review against this document and any approved mockups.
- [ ] Change log identifies every affected route and shared component.

---

## 13. Suggested phased delivery and checkpoints

**Milestone A — Foundations:** tokens, typography, button/form/card/status components, navigation shell, theme handling where supported. Review: desktop/mobile shell screenshots.

**Milestone B — Learner pilot:** Home + department cards + membership states + empty states. Review: new/pending/member screenshots, mobile screenshots, enrollment regression tests.

**Milestone C — Learning journey:** pathway/course/lesson layouts when their data and routes exist. Review: actual populated and empty states, assessment distinction, YouTube error states.

**Milestone D — Admin:** overview, membership, invitations, curriculum, people, departments, audit. Review: at least one screenshot per page, functional regression tests.

**Milestone E — Polish:** transitions, accessibility, keyboard flows, reduced motion, performance, loading states, image optimization, final visual QA.

Do not attempt all milestones in a single giant unreviewed change. After each milestone, present screenshots and a concise checklist for approval.

---

## 14. Prompt to start implementation (paste into Claude Code)

Read `CLAUDE.md`, `docs/SPEC.md`, and `docs/DESIGN-REQUIREMENTS.md` in full. Treat the design document as the UI/UX implementation contract and the existing specification as the product/security contract. First inspect the actual code and produce a file-by-file design implementation plan with identified risks. Then implement **Milestone A and Milestone B only**, without changing business logic. Create or update shared components rather than duplicating styling. Use real data, not fabricated dashboard metrics. Test new, pending, and enrolled states at 390px and 1440px; capture Playwright screenshots and compare them against the acceptance criteria. Run lint, typecheck, unit tests, and relevant E2E tests. Report changed files, screenshot paths, test results, and anything requiring my design approval before proceeding to Milestone C.

---

## 15. Visual approval checklist for the project owner

Before accepting the first milestone, answer:
1. Does the first screen clearly communicate production training rather than administration?
2. Can a volunteer identify the next action in under five seconds?
3. Do the cards look like actual training content, not generic templates?
4. Does the navigation make sense for volunteers and administrators separately?
5. Is the UI comfortable on a phone?
6. Is the curriculum pathway clear without falsely suggesting authorization to serve?
7. Do the admin screens look operationally useful rather than decorative?
8. Would the visual system still look polished with zero courses or members?
9. Are the transitions subtle and purposeful?
10. Are all existing business rules preserved?

**Final quality bar:** IFC Production Academy must feel like a coherent, branded learning product, not a collection of Tailwind examples. Design decisions must be justified by learner clarity, operational usefulness, accessibility, and visual consistency.
