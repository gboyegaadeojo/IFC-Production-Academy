# Decision: onboarding pathways (2026-11-01)

**Status:** decided by G, 2026-11-01, after reviewing the "Onboarding Pathways Mock" (option A, Flow).

## Why
SPEC §1 aims to "reduce the time it takes to onboard a new production volunteer", and the MxU patterns (SPEC §6) mention "pathways that move volunteers forward automatically", but the SPEC has no onboarding feature. G asked for one before the Camera pilot: a repeatable path from "I want to serve" to "ready for a team", inspired by MxU Pathways, done better.

## What
- **Pathways are data.** One general pathway, "Join the team", owned by the Production Directors, plus one per department, owned by that department's leaders. Each pathway has stages (with a timing label such as "Within 3 days") and ordered steps. New capability `onboarding.manage`, scoped per department; the general pathway needs an organisation-wide grant.
- **Ways in:** the public "I want to serve" page and its QR code (no account needed), a leader adding someone, and joining a department. A Planning Center workflow step is an optional way in, read only, for churches that use workflows; IFC doesn't yet, so it isn't built until it's needed.
- **Steps:** send an email, notify leaders, follow-up task, pair a mentor, assign a course, wait some days, add to a team in Planning Center, choose a department, finish.
- **Who reaches out:** a follow-up task comes from a role (for example Production Directors) and is given to one of them by turns, left for the first to claim it, or always one person. Any manager can hand it to someone else. The volunteer always sees their contact's name.
- **Leaders see** who is at which step and for how long, with history, and notes split into shared and private (private: author only, never exported, as with mentoring).

## Rules kept
- **The system decides results.** A course step moves on only when the Academy records the course finished (`course_requirements_met`), never on a leader's tick.
- **Training is shown, never a gate.** A pathway never adds anyone to a position team or approves them to serve. "Add to a team in Planning Center" is a leader task that completes itself when the 15-minute sync sees them on that team.
- **Planning Center stays read-only.**
- **Membership:** a course step makes the person a member of the course's department, recorded with the reason "Onboarding: {pathway}", as an invitation does. Membership gives training, not approval to serve.
- **No emails to volunteers until launch** (go-live checklist). Pathway emails are written to an outbox and held while `organizations.onboarding_emails_enabled` is false, its default.
- Every change to pathways, entries and tasks is audited.

## Not now
Publishing versions of a pathway (edits apply to everyone straight away; removed steps are archived, never deleted, so history stays readable), the Planning Center workflow reader, and drag-and-drop on touch screens (buttons do the same job everywhere).
