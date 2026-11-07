# App redesign: mock 5 ("B+")

**Date:** 2026-11-06. **Decided by:** G, after comparing the app with MxU on a phone and clicking
through five mocks.

## What G chose

Mock 5, B's look with parts of A:

- **Navigation.** A narrow side bar on tablets and computers: icons with their names under them, the
  current one in a tinted pill. Phones keep the five bottom tabs, with the same pill.
- **Account.** The light or dark button is one tap (a sun or moon), not a slider. The bell sits beside
  your initials. On a phone they're at the top right; in the side bar they're at the bottom, with
  your initials and first name. The account menu's top row is your name and opens your profile, so
  there's no separate "Your profile" row, and Admin lives in this menu rather than the side bar.
- **Training.** A greeting, then a bold "You're serving" card when you're on the schedule, a single
  "Pick up where you left off" card, shortcuts, your departments in a row that scrolls sideways, and
  Recently watched with how far you've got and a tick once you've marked a lesson complete.
- **Courses.** Departments in a row that scrolls sideways, so more can be added.
- **Profile.** Your initials in a large circle, your name and Edit name, three totals, Approved to
  serve, and your departments.
- **Buttons.** Smaller and calmer than before.

## What stays

The product rules don't change. Watch time is only a hint and "Completed" is the learner's own mark
(SRS-LESSON-006). Course completion, competency and Approved to Serve stay separate.

## How it's built

In small pull requests: the shell first, then Training, Courses, and the profile.

## Refinements (approved the same day)

After using it, G asked for changes and approved a second mock:

- **Training.** This month is a card beside the serving card, not a column down the whole page.
  Everything below it, including Keep exploring, uses the full width. The latest notifications
  leave the page, because the bell shows them.
- **Rows that scroll sideways** show there's more: the next card peeks in, the far edge fades, dots
  show where you are, and wider screens get arrow buttons.
- **The serving card** offers the checklist and the schedule instead of SOPs, because the team uses
  the checklist far more.
- **The side bar's** labels are 10px.
- **The bell** opens a panel instead of a page, closes when you tap it again, and has Mark all read.
  The settings move to their own page, with one choice per group (Serving, Training, Leading) for
  phone and for email, instead of a switch for every kind of notification.
- **Courses on a phone** show each department as its own row of courses that scrolls sideways.
- **Sign-in** becomes option A, "Focus": a plain page, a large headline, and one Planning Center
  button, with the email link as a second button.

## Department page: option D (2026-11-07)

G compared four mocks for a department's page (A Cover, B Path, C Overview, D Cover and Path) and
chose D:

- **A's cover:** the department's colour, icon, name, what it's for, and its size.
- **An Up next card** over the cover, with a ring of lessons done and one Continue button. On a
  phone, a slim Up next bar appears above the tabs once the card scrolls away.
- **B's path:** the levels as cards with rings, joined by a line, opening to show their courses.
  The level you're working on opens first.
- **What each role still needs:** each serving role as a checklist of membership and its
  practical skills. Courses never appear on it (SPEC §3).
