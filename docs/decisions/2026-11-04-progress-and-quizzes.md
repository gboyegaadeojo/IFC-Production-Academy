# Decision: progress and quizzes (2026-11-04)

**Status:** decided by G, 2026-11-04, from Design B of the "Academy Progress and Quizzes" mock. ADD-REPORT-02.

## What we decided

- **Volunteers see their own results on Profile:** quizzes passed, lessons complete, and each quiz's best score, with every try on request.
- **Leaders see Course progress in Reports,** using the access they already have. It covers General and Leadership too.
- **No overall score.** MxU has a Capability Score. The mock replaced it with a Quiz average, and G dropped that too, as it isn't needed.
- **Show the best score,** because people can retake a quiz.
- **Lessons are "marked complete", never "watched"** (SRS-LESSON-006).
- **"Not yet" is amber, never red,** because it has no penalty.
- **Assigning a course** is on Course progress, and shows on the person's Training page. It never blocks anyone or adds them to a team. Anyone who can see the report can assign (`course.assign`), and anyone active can be assigned. Notices are off until launch, with their own switch, because other notifications send as soon as they're queued (ADD-REPORT-03).
