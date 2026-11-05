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
- **Learner pages move to a side bar** from 768px. Phones keep their slim bar and bottom tabs, which are easier to reach than the scrolling row in the mock. The tabs are Training, Courses, Schedule, Checklist, and SOPs, with Explore a switch at the top of Courses (G, 2026-11-04). The Training home becomes rows of courses by category, with a new All courses page and course covers. Opening a course goes straight to its lesson, with the lesson list on the right. Completion stays a learner action (SRS-LESSON-006).

## Videos and Topics (G, 2026-11-04)

Choosing a course poster opens the course's summary, with its own Start or Continue, as the department page does. The Continue card on Training still goes straight to the next lesson (G, 2026-11-05). Department cards on Training show a ring of lessons complete across the department, with the count in words, replacing unlabelled lines that lit up fully after one lesson (G, 2026-11-05, Design A).

The Library in the side bar has Courses and Explore (first called Videos). Results show courses first, then single videos, and a topic on a course shows the course, not all its lessons (G, 2026-11-04). Topic is an extra filter, so there's no separate Topics page, and Explore opens on its filters instead of listing every lesson, because a full list read as every course laid out lesson by lesson (G, 2026-11-04). Leaders can tag courses as well as lessons (G, 2026-11-04), and Courses has the same Topic filter. A video is a lesson in its course, not a second copy. Course posters are upright and video thumbnails are wide, also as in MxU, because a video's still image is wide. Department Leaders and Production Directors add topics. Platform Administrators can too, since they build training. Only Production Directors and Platform Administrators rename and remove them.

## Wording (G, 2026-11-04)

Screens call these **general categories**, because "Topics" is kept for tags on videos, as in MxU. In the code and database they're still `kind = 'topic'`.

## How it's built

Topics are rows in `departments`, with `kind = 'topic'` and a `uses_levels` setting. A topic without levels has one hidden level underneath. Permissions, publishing, versions, and certificates then work with no second path. Pages that mean a team filter on `kind = 'team'`, and database triggers refuse memberships, positions, competencies, and practicals on a topic.

We rejected courses with no department, because every permission rule and report assumes one, and a plain department called General, because people would be asked to join it and it would show empty levels.
