-- Delete a course that was added by mistake (requested 2026-11-01). Only a course that has never
-- been published: it has no versions anyone learned from, so there is no history to keep
-- (SRS-CUR-008). A published course is archived instead, as before.
--
-- The course and its draft are taken out of the curriculum by setting archived_at, which the
-- courses audit trigger records (SRS-AUDIT-001). Nothing is hard-deleted, so the audit trail and
-- foreign keys stay intact; the curriculum list leaves out archived courses that were never
-- published.

create function public.discard_draft_course(p_course_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_course public.courses;
begin
  select * into v_course from public.courses c where c.id = p_course_id for update;
  if not found
     or not (private.has_capability('course.draft', v_course.department_id)
             or private.has_capability('course.publish', v_course.department_id)) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if exists (select 1 from public.course_versions v
             where v.course_id = p_course_id and v.version_number is not null) then
    raise exception 'course_was_published' using errcode = 'P0001';
  end if;
  update public.courses c set archived_at = now() where c.id = p_course_id and c.archived_at is null;
end;
$$;
revoke all on function public.discard_draft_course(uuid) from public, anon;
grant execute on function public.discard_draft_course(uuid) to authenticated;
