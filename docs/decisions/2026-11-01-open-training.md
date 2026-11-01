# Decision: training is open to everyone (2026-11-01)

**Status:** decided by G, 2026-11-01.

## Why
G: anyone allowed into the Academy should be able to take and try any course they want, without a director or department lead approving them first. Someone might take a course out of interest and decide to go deeper.

## What changes
- **Any active Academy user can open every course** in a department that is `active` or `coming_soon`: lessons, progress, quizzes, SOPs and their files, competencies, practical requests and certificates. An `inactive` (hidden) department stays closed.
- In the database, `private.can_learn(department)` decides this, and `private.is_department_member` now calls it, so every training policy and function that used it follows without being rewritten (migration `20261207120000_open_training.sql`).
- `record_practical_assessment` no longer needs the learner to be a member, only an active profile.
- Training shows "See courses" for every open department, and a course started outside your departments shows with Continue.

## What stays the same
- **Department membership still exists** and is still requested and approved. It now means "part of this department's team": leader lists, the department's dashboards, onboarding and nudges.
- **Position teams still decide who serves**, and Approved to Serve still follows only from passing the competency. Taking a course never adds anyone to a team.
- History, audit and versioning are unchanged.

## Spec conflict
SRS-MEM-005 ("Restricted content only while membership or explicit permission is active") no longer holds for training content; this decision supersedes it. Admin and leader tools are still restricted by capability.

## Known gaps (later)
- The practical observer's learner list (`assessable_members`) shows members only; a non-member reaches it through their own assessment request.
- Leader dashboards and learning nudges count members only.
