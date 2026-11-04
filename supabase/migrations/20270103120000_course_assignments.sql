-- Assigning a course (G, 2026-11-04; ADD-REPORT-03). A leader asks someone to take a course, and it
-- shows on their Training page. It's a request and nothing more: it never blocks anything, adds
-- anyone to a team, or counts towards a competency or Approved to Serve.

alter type public.notification_kind add value if not exists 'course_assigned';

-- Other notifications are emailed as soon as they're queued. These stay off until launch, and
-- nothing is queued while they're off, so nobody gets a stale notice when they're switched on.
alter table public.organizations
  add column course_assignment_notices_enabled boolean not null default false;

insert into public.capabilities (key, description)
values ('course.assign', 'Ask someone to take a course')
on conflict (key) do nothing;

-- The people who can already see Course progress.
insert into public.role_capabilities (role_id, capability_id)
select r.id, c.id
from public.roles r, public.capabilities c
where r.key in ('trainer', 'department_leader', 'production_director', 'platform_admin')
  and c.key = 'course.assign'
on conflict do nothing;

create table public.course_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete restrict,
  course_id uuid not null references public.courses (id) on delete restrict,
  department_id uuid not null references public.departments (id) on delete restrict,
  assigned_by uuid references public.profiles (id) on delete set null,
  assigned_at timestamptz not null default now(),
  removed_by uuid references public.profiles (id) on delete set null,
  removed_at timestamptz
);
-- Removing one keeps the row, so assigning again makes a new one.
create unique index course_assignments_current_idx
  on public.course_assignments (user_id, course_id) where removed_at is null;
create index course_assignments_course_idx on public.course_assignments (course_id);
create index course_assignments_department_idx on public.course_assignments (department_id);

alter table public.course_assignments enable row level security;
create policy "People read their own assignments; report viewers read their department's"
  on public.course_assignments for select to authenticated
  using (
    (user_id = (select auth.uid()) and private.is_active_user())
    or private.has_capability('report.view', department_id)
  );
grant select on public.course_assignments to authenticated;

create trigger course_assignments_audit after insert or update on public.course_assignments
  for each row execute function private.audit_change('course_assignment');

-- Safe to retry: someone already assigned stays as they are, with no second notice.
create function public.assign_course(p_course_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_department uuid;
  v_assignment uuid;
  v_title text;
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

  insert into public.course_assignments (user_id, course_id, department_id, assigned_by)
  values (p_user_id, p_course_id, v_department, (select auth.uid()))
  on conflict (user_id, course_id) where removed_at is null do nothing
  returning id into v_assignment;

  if v_assignment is not null and exists (
    select 1 from public.organizations o
    where o.id = private.current_organization_id() and o.course_assignment_notices_enabled
  ) then
    perform private.notify(p_user_id, 'course_assigned', 'Course for you: ' || v_title,
      'A leader asked you to take this course. Go at your own pace.',
      '/courses/' || p_course_id, 'course_assigned:' || v_assignment);
  end if;
end;
$$;
revoke all on function public.assign_course(uuid, uuid) from public, anon;
grant execute on function public.assign_course(uuid, uuid) to authenticated;

-- Safe to retry: with nothing to remove, it does nothing. Progress in the course stays.
create function public.remove_course_assignment(p_course_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_department uuid;
begin
  select c.department_id into v_department from public.courses c where c.id = p_course_id;
  if v_department is null
     or not private.is_active_user()
     or not private.has_capability('course.assign', v_department) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  update public.course_assignments a
     set removed_at = now(), removed_by = (select auth.uid())
   where a.user_id = p_user_id and a.course_id = p_course_id and a.removed_at is null;
end;
$$;
revoke all on function public.remove_course_assignment(uuid, uuid) from public, anon;
grant execute on function public.remove_course_assignment(uuid, uuid) to authenticated;

-- Who a course can be assigned to: anyone active, since training is open to everyone. Names only.
create function public.assignable_people(p_course_id uuid)
returns table (user_id uuid, display_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.display_name
  from public.courses c
  join public.profiles p on p.organization_id = private.current_organization_id()
  where c.id = p_course_id
    and p.status = 'active'
    and private.is_active_user()
    and private.has_capability('course.assign', c.department_id)
  order by p.display_name;
$$;
revoke all on function public.assignable_people(uuid) from public, anon;
grant execute on function public.assignable_people(uuid) to authenticated;

-- As in 20261218120000_open_training_learners.sql, plus anyone assigned a course here, so they show
-- on Course progress before they've started.
create or replace function private.department_learners(p_department_id uuid)
returns table (user_id uuid, joined_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  with activity as (
    select p.user_id, p.created_at as started_at from public.lesson_progress p where p.department_id = p_department_id
    union all
    select a.user_id, a.created_at from public.quiz_attempts a where a.department_id = p_department_id
    union all
    select pa.user_id, pa.created_at from public.practical_assessments pa where pa.department_id = p_department_id
    union all
    select r.user_id, r.requested_at from public.assessment_requests r where r.department_id = p_department_id
    union all
    select ca.user_id, ca.assigned_at from public.course_assignments ca
      where ca.department_id = p_department_id and ca.removed_at is null
  )
  select m.user_id, coalesce(m.decided_at, m.created_at)
  from public.department_memberships m
  where m.department_id = p_department_id and m.status = 'active'
  union all
  select a.user_id, min(a.started_at)
  from activity a
  join public.profiles pr on pr.id = a.user_id and pr.status = 'active'
  where not exists (
    select 1 from public.department_memberships m
    where m.department_id = p_department_id and m.user_id = a.user_id and m.status = 'active')
  group by a.user_id;
$$;
