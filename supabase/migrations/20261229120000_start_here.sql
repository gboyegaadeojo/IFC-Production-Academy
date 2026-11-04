-- Start here (G, 2026-11-04; SRS-CUR-018). A leader can mark a topic's course as the place for
-- everyone to begin. It shows on Training and beside names on the team page. It's shown, never a
-- gate: nothing here stops anyone joining, serving, or being added to a team (CLAUDE.md rule 2).

alter table public.courses add column start_here boolean not null default false;

create function public.set_course_start_here(p_course_id uuid, p_on boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (private.is_active_user() and exists (
    select 1 from public.courses c
    join public.departments d on d.id = c.department_id
    where c.id = p_course_id and d.kind = 'topic'
      and private.has_capability('course.publish', c.department_id)
  )) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  -- The courses audit trigger records this.
  update public.courses c set start_here = p_on where c.id = p_course_id;
end;
$$;
revoke all on function public.set_course_start_here(uuid, boolean) from public, anon;
grant execute on function public.set_course_start_here(uuid, boolean) to authenticated;

-- For each person on a department's position teams, whether they've finished each Start here course.
create function public.start_here_status(p_department_id uuid)
returns table (user_id uuid, course_id uuid, course_title text, finished boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (private.is_active_user() and private.has_capability('team.manage', p_department_id)) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  return query
  select people.user_id, c.id, v.title, private.course_requirements_met(people.user_id, c.id)
  from (
    select distinct m.user_id
    from public.serving_team_members m
    join public.serving_roles r on r.id = m.role_id
    where r.department_id = p_department_id
  ) as people
  cross join public.courses c
  join public.course_versions v on v.course_id = c.id and v.status = 'published'
  where c.start_here and c.archived_at is null;
end;
$$;
revoke all on function public.start_here_status(uuid) from public, anon;
grant execute on function public.start_here_status(uuid) to authenticated;
