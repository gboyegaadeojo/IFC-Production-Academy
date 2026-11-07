-- An optional due date when assigning a course (G, 2026-11-07, course page Actions menu, option 1;
-- ADD-REPORT-03). It's a date to aim for and nothing more: missing it never blocks anything.

alter table public.course_assignments add column due_on date;

-- Replaces the two-argument version from 20270104120000_hold_notifications_until_launch.sql. It now
-- says what happened, so the page can tell a leader whether they assigned someone or changed a date.
drop function public.assign_course(uuid, uuid);

-- Safe to retry: the same person and date again changes nothing and sends no second notice.
-- Someone already assigned keeps their assignment, and only the due date changes.
create function public.assign_course(p_course_id uuid, p_user_id uuid, p_due_on date default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_department uuid;
  v_assignment uuid;
  v_current date;
  v_title text;
  v_due text;
begin
  select c.department_id into v_department from public.courses c where c.id = p_course_id;
  if v_department is null
     or not private.is_active_user()
     or not private.has_capability('course.assign', v_department) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  select v.title into v_title
    from public.courses c
    join public.course_versions v on v.course_id = c.id and v.status = 'published'
   where c.id = p_course_id and c.archived_at is null;
  if v_title is null then
    raise exception 'course_not_available' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.profiles p
    where p.id = p_user_id and p.status = 'active'
      and p.organization_id = private.current_organization_id()
  ) then
    raise exception 'person_not_available' using errcode = 'P0001';
  end if;
  if p_due_on < (now() at time zone 'America/Winnipeg')::date then
    raise exception 'due_date_past' using errcode = 'P0001';
  end if;
  v_due := to_char(p_due_on, 'Dy, Mon FMDD');

  select a.id, a.due_on into v_assignment, v_current
    from public.course_assignments a
   where a.user_id = p_user_id and a.course_id = p_course_id and a.removed_at is null;

  if v_assignment is not null then
    if v_current is not distinct from p_due_on then
      return 'unchanged';
    end if;
    update public.course_assignments set due_on = p_due_on where id = v_assignment;
    perform private.notify(p_user_id, 'course_assigned',
      case when p_due_on is null then 'No due date now: ' else 'New due date: ' end || v_title,
      case when p_due_on is null
        then 'A leader took the due date off this course. Go at your own pace.'
        else 'A leader asked you to finish this course by ' || v_due || '.' end,
      '/courses/' || p_course_id,
      'assignment_due:' || v_assignment || ':' || extract(epoch from now())::bigint);
    return 'updated';
  end if;

  insert into public.course_assignments (user_id, course_id, department_id, assigned_by, due_on)
  values (p_user_id, p_course_id, v_department, (select auth.uid()), p_due_on)
  on conflict (user_id, course_id) where removed_at is null do nothing
  returning id into v_assignment;

  if v_assignment is null then
    return 'unchanged';
  end if;
  perform private.notify(p_user_id, 'course_assigned', 'Course for you: ' || v_title,
    case when p_due_on is null
      then 'A leader asked you to take this course. Go at your own pace.'
      else 'A leader asked you to take this course by ' || v_due || '.' end,
    '/courses/' || p_course_id, 'course_assigned:' || v_assignment);
  return 'assigned';
end;
$$;
revoke all on function public.assign_course(uuid, uuid, date) from public, anon;
grant execute on function public.assign_course(uuid, uuid, date) to authenticated;
