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
