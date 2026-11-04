# Decision: topics beside departments (2026-11-04)

**Status:** decided by G, 2026-11-04, from the "Academy Course Hierarchy" mock. SRS-CUR-015.

## Why

Departments build proficiency in a craft, but some courses belong to the whole team. A Guide to Serving is the first example, and leadership courses are the next. G looked at how MxU organises its library, by Category and Difficulty, and wanted something as simple.

## What we decided

- **Every course sits in one category.** A category is a department or a topic.
- **A department** is a team, as before: leaders, members, positions, three levels.
- **A topic** is courses only. To start with, General (no levels) and Leadership (three levels). More can be added without code.
- **Topics have lessons, quizzes, versions, and certificates, but no practicals or competencies** (G, 2026-11-04), and never count towards Approved to Serve.
- **Production Directors publish topics.** The capability grant is the same one they hold everywhere.
- **A Guide to Serving lives in General.** Training stays shown, never a gate: it can be marked Start here and be a step in the Join the team pathway, and the team page shows it beside each name, but it never stops anyone being added to a team.
- **Learner pages move to a side bar**, which becomes a scrolling row of links on phones. The Training home becomes rows of courses by category, with a new All courses page and course covers. Opening a course goes straight to its lesson, with the lesson list on the right. Completion stays a learner action (SRS-LESSON-006).

## How it's built

Topics are rows in `departments`, with `kind = 'topic'` and a `uses_levels` setting. A topic without levels has one hidden level underneath. Permissions, publishing, versions, and certificates then work with no second path. Pages that mean a team filter on `kind = 'team'`, and database triggers refuse memberships, positions, competencies, and practicals on a topic.

We rejected courses with no department, because every permission rule and report assumes one, and a plain department called General, because people would be asked to join it and it would show empty levels.
