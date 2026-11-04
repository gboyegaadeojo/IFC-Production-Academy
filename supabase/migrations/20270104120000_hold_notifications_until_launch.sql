-- The launch switch (G, 2026-11-04; ADD-NOTIF-02). Nothing leaves the app until the Academy goes
-- live: notifications still show in the app, but aren't emailed or sent to devices, except to the
-- people on notification_testers, so a pilot can check them. What's held is never sent later, so
-- nobody gets a pile of old notices on launch day. Sign-in links and the admins' job alerts don't
-- come through here. Onboarding emails keep their own switch, onboarding_emails_enabled.

alter table public.organizations
  add column notifications_live boolean not null default false;

create table public.notification_testers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles (id) on delete restrict,
  added_at timestamptz not null default now()
);
-- No policies and no grants: this is only changed by hand in the database, as the runbook says.
alter table public.notification_testers enable row level security;

create trigger notification_testers_audit after insert or update or delete on public.notification_testers
  for each row execute function private.audit_change('notification_tester');

-- Email and device alerts both start from a new row here, so this is the one place to hold them.
create function private.hold_notification_until_live()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.profiles p
    join public.organizations o on o.id = p.organization_id
    where p.id = new.user_id and o.notifications_live
  ) and not exists (
    select 1 from public.notification_testers t where t.user_id = new.user_id
  ) then
    new.email_status := 'skipped';
    new.push_status := 'none';
  end if;
  return new;
end;
$$;
revoke all on function private.hold_notification_until_live() from public, anon, authenticated;
create trigger notifications_hold_until_live before insert on public.notifications
  for each row execute function private.hold_notification_until_live();

-- Anything already waiting is held too.
update public.notifications set email_status = 'skipped' where email_status = 'pending';
update public.notifications set push_status = 'none' where push_status = 'pending';

-- The switch above replaces this one, added in 20270103120000_course_assignments.sql.
alter table public.organizations drop column course_assignment_notices_enabled;

create or replace function public.assign_course(p_course_id uuid, p_user_id uuid)
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

  if v_assignment is not null then
    perform private.notify(p_user_id, 'course_assigned', 'Course for you: ' || v_title,
      'A leader asked you to take this course. Go at your own pace.',
      '/courses/' || p_course_id, 'course_assigned:' || v_assignment);
  end if;
end;
$$;
