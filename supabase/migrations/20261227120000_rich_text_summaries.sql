-- Course and lesson summaries are rich text now, so they get more room (G, 2026-11-04; SRS-CUR-016).
alter table public.course_versions drop constraint course_versions_summary_check;
alter table public.course_versions
  add constraint course_versions_summary_check check (length(summary) <= 5000);

alter table public.lessons drop constraint lessons_summary_check;
alter table public.lessons
  add constraint lessons_summary_check check (length(summary) <= 5000);
