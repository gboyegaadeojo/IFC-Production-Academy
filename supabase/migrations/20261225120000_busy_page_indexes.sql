-- Indexes for the links that busy pages read by (app review, item 29). The database's advisor lists
-- about 125 unindexed links, and most only matter for rare deletes, so they stay as they are.
create index if not exists lesson_progress_course_id_idx on public.lesson_progress (course_id);
create index if not exists quiz_attempts_course_id_idx on public.quiz_attempts (course_id);
create index if not exists practical_assessments_course_id_idx on public.practical_assessments (course_id);
create index if not exists certificates_course_id_idx on public.certificates (course_id);
create index if not exists event_assignments_event_id_idx on public.event_assignments (event_id);
create index if not exists checklist_checkoffs_item_id_idx on public.checklist_checkoffs (item_id);
create index if not exists checklist_checkoffs_checklist_id_idx on public.checklist_checkoffs (checklist_id);
create index if not exists checklists_department_id_idx on public.checklists (department_id);
