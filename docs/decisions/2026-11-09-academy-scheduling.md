# Scheduling production in the Academy

**Decided by G, 2026-11-09.** Requirements: SRS-SCHED-*, SRS-COMP-005, SRS-COMP-006, SRS-COMP-008,
ADD-SCHED-01, SRS-AUDIT-001. Revises parts of decision 9 in
[the 2026-10-31 decisions](2026-10-31-open-decisions.md).

## Why

G wants one system for production: training, checklists, the Service Dashboard, and the schedule.
The Academy should be able to do what Planning Center Services does for production, so IFC can
stop using Services for production whenever it chooses. Until then, nothing changes.

## What we decided

- **One switch.** **Who schedules** on the Planning Center page (`organizations.scheduling_source`)
  chooses Planning Center or the Academy. Production stays on Planning Center until G changes it,
  and every part of this work is released switched off.
- **While the Academy schedules, Planning Center Services isn't read.** The sync job stops, and the
  database refuses it (`academy_schedules`), so nothing from Planning Center can overwrite the
  Academy's schedule. Sign in with Planning Center keeps working.
- **Switching over copies what's there.** Service types, teams, upcoming services with their order
  of service, who's scheduled with their replies, and blockouts are copied once, keeping each
  Planning Center id, so switching back matches them up again. Past services are never changed.
- **Production only.** Worship and other ministries stay in Planning Center. No song library.
- **What the Academy does, as in Planning Center:**
  - Several people on one position, and extra positions on one service.
  - People added to a service are "Not sent yet" until a scheduler chooses **Send requests**, which
    emails each of them once, with Accept and Decline.
  - A reminder email a chosen number of days before (1 to 7), set per service type and per service.
  - Service types (Sunday Service, Holy Communion Service, Thanksgiving Service…) with their
    positions, times, and usual plan. Plan templates for the order of service. Any template can be
    picked when making a service.
  - Teams per position decide who can be picked.
  - Blockouts for one day, a date range, part of a day, or repeating, with a reason.
  - When someone declines, the scheduler is told, and the Academy adds the best free person from
    that team and asks them. If nobody is free, the spot stays open.
  - Auto-schedule, scheduling preferences, files, a live run of service, and a calendar link.
- **Conflicts warn, they don't block.** Someone blocked out, or already in another position at the
  same service, can still be added, with a warning banner. This replaces "never on a blocked day or
  in a second position the same day" from 2026-10-31. Override reasons are no longer needed for
  these. The Academy's own choices (auto-schedule and replacing someone who declined) still never
  pick someone blocked out or already serving. Filling a position only from its team stays a rule.

## How it's delivered

As small updates, each safe while Planning Center schedules. The first makes the switch stop the
sync, guards service types, and adds **Edit details** to a service. The approved mock is the
guide for the screens.
