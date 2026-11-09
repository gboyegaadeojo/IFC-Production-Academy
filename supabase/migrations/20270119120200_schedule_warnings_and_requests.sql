-- Conflicts warn instead of blocking, and requests are sent when the scheduler is ready
-- (G, 2026-11-09; plan "Academy scheduling", PR 3; decision 2026-11-09-academy-scheduling).
--
-- * Someone already serving at the same time or that day, or blocked out, can still be scheduled.
--   The service page shows a warning for each (event_conflicts), as Planning Center does. Only the
--   position's team can be scheduled, as before. Sign-ups and taking cover keep their checks, and
--   the Academy's own choices (coming in later updates) never pick someone with a conflict.
-- * A scheduler's assignment starts "Not sent yet" (request_sent_at is null): nobody is emailed
--   until the scheduler chooses Send requests, which sends each person one request for everything
--   they're on at that service. Sign-ups, cover, and synced rows count as sent when made.
-- * Reminders to confirm count from when the request was sent.

alter table public.event_assignments add column request_sent_at timestamptz default now();
comment on column public.event_assignments.request_sent_at is
  'When the person was asked to accept. Null: scheduled but not sent yet.';

-- Another place the person is serving that day or at an overlapping time, other than this one.
create function private.serving_elsewhere(p_user_id uuid, p_event_id uuid, p_assignment_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select r.name || case when other.id = this.id then '' else ' (' || other.title || ')' end
  from public.event_assignments a
  join public.events other on other.id = a.event_id and other.cancelled_at is null
  join public.events this on this.id = p_event_id
  join public.serving_roles r on r.id = a.role_id
  where a.user_id = p_user_id and a.id <> p_assignment_id
    and a.status in ('pending', 'confirmed')
    and ((other.starts_at < this.ends_at and this.starts_at < other.ends_at)
         or (other.starts_at at time zone 'America/Winnipeg')::date
              = (this.starts_at at time zone 'America/Winnipeg')::date)
  order by other.id = this.id desc, other.starts_at
  limit 1;
$$;
revoke all on function private.serving_elsewhere(uuid, uuid, uuid) from public, anon, authenticated;

-- The blockout covering a service, with its note, if any.
create function private.blockout_note(p_user_id uuid, p_event_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(nullif(trim(u.note), ''), 'Away')
  from public.unavailability u
  join public.events e on e.id = p_event_id
  where u.user_id = p_user_id
    and (e.starts_at at time zone 'America/Winnipeg')::date between u.starts_on and u.ends_on
  order by u.starts_on
  limit 1;
$$;
revoke all on function private.blockout_note(uuid, uuid) from public, anon, authenticated;

-- Warnings for the service page: who is also serving elsewhere that day, or blocked out. Only
-- assignments in departments the person schedules.
create function public.event_conflicts(p_event_id uuid)
returns table (assignment_id uuid, serving_elsewhere text, blocked_out text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.has_capability_anywhere('schedule.manage') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  return query
    select c.id, c.elsewhere, c.blocked
    from (
      select a.id, a.department_id,
             private.serving_elsewhere(a.user_id, a.event_id, a.id) as elsewhere,
             private.blockout_note(a.user_id, a.event_id) as blocked
      from public.event_assignments a
      where a.event_id = p_event_id and a.status in ('pending', 'confirmed')
    ) c
    where (c.elsewhere is not null or c.blocked is not null)
      and private.has_capability('schedule.manage', c.department_id);
end;
$$;
revoke all on function public.event_conflicts(uuid) from public, anon;
grant execute on function public.event_conflicts(uuid) to authenticated;

create or replace function public.assign_to_position(
  p_position_id uuid,
  p_user_id uuid,
  p_supervisor_id uuid default null,
  p_override_reason text default null
)
returns public.assignment_readiness
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_position public.event_positions;
  v_event public.events;
  v_reason text := nullif(trim(coalesce(p_override_reason, '')), '');
  v_readiness public.assignment_readiness;
begin
  select * into v_position from public.event_positions p where p.id = p_position_id for update;
  if v_position.id is null or not private.has_capability('schedule.manage', v_position.department_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  select * into v_event from public.events e where e.id = v_position.event_id;
  if v_event.cancelled_at is not null or v_event.ends_at <= now() then
    raise exception 'event_closed' using errcode = 'P0001';
  end if;
  if v_reason is not null and length(v_reason) > 300 then
    raise exception 'invalid_reason' using errcode = '22023';
  end if;
  if not private.is_on_position_team(p_user_id, v_position.role_id) then
    raise exception 'not_on_team' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.event_assignments a
    where a.position_id = p_position_id and a.status in ('pending', 'confirmed')
  ) then
    raise exception 'position_filled' using errcode = 'P0001';
  end if;

  -- Serving elsewhere that day, or blocked out, is a warning on the service page, not a block.
  if private.is_approved_for_role(p_user_id, v_position.role_id) then
    v_readiness := 'approved';
  elsif p_supervisor_id is not null then
    if p_supervisor_id = p_user_id
       or not private.is_approved_for_role(p_supervisor_id, v_position.role_id) then
      raise exception 'supervisor_not_approved' using errcode = 'P0001';
    end if;
    v_readiness := 'supervised';
  else
    v_readiness := 'learning';
  end if;

  insert into public.event_assignments
    (position_id, event_id, department_id, role_id, user_id, readiness, supervisor_id,
     override_reason, assigned_by, request_sent_at)
  values (p_position_id, v_event.id, v_position.department_id, v_position.role_id, p_user_id,
          v_readiness, case when v_readiness = 'supervised' then p_supervisor_id end,
          v_reason, (select auth.uid()), null);
  return v_readiness;
end;
$$;

-- Asked when sent, not when scheduled.
create or replace function private.notify_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events;
  v_role text;
begin
  if new.assigned_by is null or new.assigned_by = new.user_id or new.request_sent_at is null then
    return null;
  end if;
  select * into v_event from public.events e where e.id = new.event_id;
  select r.name into v_role from public.serving_roles r where r.id = new.role_id;
  perform private.notify(new.user_id, 'assignment_scheduled',
    'You''re scheduled: ' || coalesce(v_role, 'a serving role'),
    v_event.title || ', ' ||
      to_char(v_event.starts_at at time zone 'America/Winnipeg', 'Dy Mon FMDD, FMHH12:MI AM') ||
      '. Please confirm or decline.',
    '/schedule',
    'assignment:' || new.id);
  return null;
end;
$$;

-- Send requests: each chosen person gets one request for everything they're on at the service.
-- Safe to retry: people already asked aren't asked again.
create function public.send_assignment_requests(
  p_event_id uuid,
  p_assignment_ids uuid[],
  p_message text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events;
  v_message text := nullif(trim(coalesce(p_message, '')), '');
  v_person record;
  v_people integer := 0;
begin
  if not private.has_capability_anywhere('schedule.manage') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if v_message is not null and length(v_message) > 500 then
    raise exception 'invalid_note' using errcode = '22023';
  end if;
  select * into v_event from public.events e where e.id = p_event_id;
  if v_event.id is null or v_event.cancelled_at is not null or v_event.ends_at <= now() then
    raise exception 'event_closed' using errcode = 'P0001';
  end if;

  for v_person in
    with sent as (
      update public.event_assignments a set request_sent_at = now()
       where a.event_id = p_event_id and a.id = any (p_assignment_ids)
         and a.status = 'pending' and a.request_sent_at is null
         and private.has_capability('schedule.manage', a.department_id)
      returning a.user_id, a.role_id
    )
    select s.user_id, string_agg(r.name, ', ' order by r.name) as roles
    from sent s join public.serving_roles r on r.id = s.role_id
    group by s.user_id
  loop
    perform private.notify(v_person.user_id, 'assignment_scheduled',
      'Please accept: ' || v_person.roles,
      v_event.title || ', ' ||
        to_char(v_event.starts_at at time zone 'America/Winnipeg', 'Dy Mon FMDD, FMHH12:MI AM') ||
        '. Please confirm or decline.' ||
        coalesce(' ' || v_message, ''),
      '/schedule',
      'request:' || p_event_id || ':' || v_person.user_id || ':' || extract(epoch from now())::bigint);
    v_people := v_people + 1;
  end loop;

  if v_people > 0 then
    insert into public.audit_events (organization_id, actor_id, action, target_table, target_id, metadata)
    values (v_event.organization_id, (select auth.uid()), 'schedule.requests_sent', 'events',
            p_event_id, jsonb_build_object('people', v_people));
  end if;
  return v_people;
end;
$$;
revoke all on function public.send_assignment_requests(uuid, uuid[], text) from public, anon;
grant execute on function public.send_assignment_requests(uuid, uuid[], text) to authenticated;

-- Reminders to confirm count from when the request was sent; nobody is reminded of a request
-- that hasn't gone out.
create or replace function public.queue_reminders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer := 0;
  v_row record;
  v_holder uuid;
  v_next text;
  v_stage integer;
  v_learner text;
begin
  -- Please confirm.
  for v_row in
    select a.id, a.user_id, e.title, e.starts_at, r.name as role_name
    from public.event_assignments a
    join public.events e on e.id = a.event_id and e.cancelled_at is null
      and e.source = 'academy'
    join public.serving_roles r on r.id = a.role_id
    where a.status = 'pending'
      and a.request_sent_at <= now() - interval '48 hours'
      and e.starts_at > now() + interval '1 day'
  loop
    perform private.notify(v_row.user_id, 'serving_reminder',
      'Please confirm: ' || v_row.role_name,
      v_row.title || ', ' || private.winnipeg_when(v_row.starts_at) ||
        '. Let your leader know whether you can serve.',
      '/schedule', 'confirm:' || v_row.id);
    v_count := v_count + 1;
  end loop;

  -- Serving soon: from 10:00 two days before, Winnipeg time (ADD-SCHED-01).
  for v_row in
    select a.id, a.user_id, a.supervisor_id, e.title, e.starts_at, r.name as role_name,
           pr.display_name as volunteer_name
    from public.event_assignments a
    join public.events e on e.id = a.event_id and e.cancelled_at is null
      and e.source = 'academy'
    join public.serving_roles r on r.id = a.role_id
    join public.profiles pr on pr.id = a.user_id
    cross join lateral (
      select ((((e.starts_at at time zone 'America/Winnipeg')::date - 2) + time '10:00')
                at time zone 'America/Winnipeg') as remind_at
    ) t
    where a.status = 'confirmed'
      and e.starts_at > now()
      and now() >= t.remind_at
      and a.assigned_at < t.remind_at
  loop
    perform private.notify(v_row.user_id, 'serving_reminder',
      'Serving soon: ' || v_row.role_name,
      v_row.title || ', ' || private.winnipeg_when(v_row.starts_at) ||
        '. Review the SOPs for your role before you arrive.',
      '/schedule', 'serving_soon:' || v_row.id);
    v_count := v_count + 1;
    if v_row.supervisor_id is not null then
      perform private.notify(v_row.supervisor_id, 'serving_reminder',
        'You''re supervising ' || coalesce(v_row.volunteer_name, 'a volunteer'),
        v_row.role_name || ' at ' || v_row.title || ', ' ||
          private.winnipeg_when(v_row.starts_at) || '.',
        '/schedule', 'serving_soon:' || v_row.id || ':supervisor');
      v_count := v_count + 1;
    end if;
  end loop;

  -- Keep going (ADD-NOTIF-01): 7 and 21 days after the last activity on a started course.
  for v_row in
    with activity as (
      select lp.user_id, lp.course_id, lp.department_id,
             max(greatest(lp.last_viewed_at, lp.updated_at)) as last_at
      from public.lesson_progress lp
      group by lp.user_id, lp.course_id, lp.department_id
      union all
      select qa.user_id, qa.course_id, qa.department_id,
             max(coalesce(qa.submitted_at, qa.started_at))
      from public.quiz_attempts qa
      group by qa.user_id, qa.course_id, qa.department_id
    ),
    latest as (
      select user_id, course_id, department_id, max(last_at) as last_at
      from activity
      group by user_id, course_id, department_id
    )
    select l.user_id, l.course_id, l.last_at, v.id as version_id, v.title as course_title
    from latest l
    join public.courses c on c.id = l.course_id and c.archived_at is null
    join public.course_versions v on v.course_id = c.id and v.status = 'published'
    join public.profiles p on p.id = l.user_id and p.status = 'active'
    where l.last_at <= now() - interval '7 days'
      and l.last_at > now() - interval '60 days'
      and not exists (select 1 from public.certificates ct
                      where ct.user_id = l.user_id and ct.course_id = l.course_id)
      and not exists (select 1 from public.assessment_requests ar
                      where ar.user_id = l.user_id and ar.course_id = l.course_id
                        and ar.closed_at is null)
  loop
    continue when private.course_requirements_met(v_row.user_id, v_row.course_id);
    v_stage := case when v_row.last_at <= now() - interval '21 days' then 21 else 7 end;
    select le.title into v_next
    from public.lessons le
    join public.course_modules cm on cm.id = le.module_id
    where le.course_version_id = v_row.version_id
      and not exists (select 1 from public.lesson_progress lp
                      where lp.user_id = v_row.user_id and lp.course_id = v_row.course_id
                        and lp.lesson_key = le.lesson_key and lp.status = 'completed')
    order by cm.sort_order, le.sort_order
    limit 1;
    perform private.notify(v_row.user_id, 'learning_nudge',
      'Keep going: ' || v_row.course_title,
      case when v_next is not null
           then 'Your next lesson is ' || v_next || '.'
           else 'Your lessons are done. Your next step is the quiz or practical assessment.' end,
      '/courses/' || v_row.course_id,
      'nudge:' || v_stage || ':' || v_row.user_id || ':' || v_row.course_id || ':' ||
        (v_row.last_at at time zone 'America/Winnipeg')::date);
    v_count := v_count + 1;
  end loop;

  -- Assessment waiting: open for 7 days, to the department's leaders.
  for v_row in
    select ar.id, ar.department_id, pr.display_name as learner
    from public.assessment_requests ar
    join public.profiles pr on pr.id = ar.user_id and pr.status = 'active'
    where ar.closed_at is null and ar.requested_at <= now() - interval '7 days'
  loop
    for v_holder in
      select * from private.department_capability_holders('competency.approve', v_row.department_id)
    loop
      perform private.notify(v_holder, 'assessment_requested',
        coalesce(v_row.learner, 'A volunteer') || ' has waited a week for an assessment',
        'Their request is still open. Arrange an assessment or a trainer who can observe.',
        '/admin/assessments', 'assessment_waiting:' || v_row.id || ':' || v_holder);
      v_count := v_count + 1;
    end loop;
  end loop;

  -- SOP review overdue: once, a week after the review date (SRS-SOP-004).
  for v_row in
    select s.id, s.owner_id, v.title,
           (s.last_reviewed_at + make_interval(months => s.review_interval_months)) as due_at
    from public.sops s
    join public.sop_versions v on v.sop_id = s.id and v.status = 'published'
    where s.archived_at is null and s.owner_id is not null and s.last_reviewed_at is not null
      and s.last_reviewed_at + make_interval(months => s.review_interval_months)
          <= now() - interval '7 days'
  loop
    perform private.notify(v_row.owner_id, 'sop_review_due', 'Review overdue: ' || v_row.title,
      'This SOP is past its review date. Check it, then mark it reviewed or publish an update.',
      '/admin/sops/' || v_row.id,
      'sop_overdue:' || v_row.id || ':' || (v_row.due_at at time zone 'America/Winnipeg')::date);
    v_count := v_count + 1;
  end loop;

  -- Competency expiring in 30 days (SRS-COMP-009), to the volunteer and the department's leaders.
  for v_row in
    select cr.id, cr.user_id, cr.department_id, cr.expires_at, co.name as competency,
           pr.display_name as volunteer
    from public.competency_records cr
    join public.competencies co on co.id = cr.competency_id
    join public.profiles pr on pr.id = cr.user_id and pr.status = 'active'
    where cr.status = 'approved' and cr.expires_at is not null
      and cr.expires_at > now() and cr.expires_at <= now() + interval '30 days'
  loop
    perform private.notify(v_row.user_id, 'competency_expiring',
      'Renew soon: ' || v_row.competency,
      'Your approval expires on ' ||
        to_char(v_row.expires_at at time zone 'America/Winnipeg', 'FMMonth FMDD, YYYY') ||
        '. Ask a trainer to reassess you before then.',
      '/profile',
      'competency_expiring:' || v_row.id || ':' || (v_row.expires_at at time zone 'America/Winnipeg')::date);
    v_count := v_count + 1;
    for v_holder in
      select * from private.department_capability_holders('competency.approve', v_row.department_id)
    loop
      continue when v_holder = v_row.user_id;
      perform private.notify(v_holder, 'competency_expiring',
        coalesce(v_row.volunteer, 'A volunteer') || '''s ' || v_row.competency || ' expires soon',
        'It expires on ' ||
          to_char(v_row.expires_at at time zone 'America/Winnipeg', 'FMMonth FMDD, YYYY') ||
          '. A reassessment keeps them approved to serve.',
        '/admin/competencies',
        'competency_expiring:' || v_row.id || ':' ||
          (v_row.expires_at at time zone 'America/Winnipeg')::date || ':' || v_holder);
      v_count := v_count + 1;
    end loop;
  end loop;

  return v_count;
end;
$$;

