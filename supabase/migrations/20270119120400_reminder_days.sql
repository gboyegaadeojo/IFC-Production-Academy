-- Choose how many days before a service its reminder goes out (G, 2026-11-09; plan "Academy
-- scheduling", PR 5). Set on a service type for the services made from it, and on each service.
-- 1 to 7 days, two unless changed, always at 10:00 Winnipeg time, to everyone who accepted.
-- Planning Center's services keep their reminder two days before (queue_serving_reminders).

alter table public.service_types
  add column reminder_days integer not null default 2 check (reminder_days between 1 and 7);
alter table public.events
  add column reminder_days integer not null default 2 check (reminder_days between 1 and 7);
-- Schedulers change a service's reminder directly, as they change its details.
grant update (reminder_days) on public.events to authenticated;

-- Services made from a type take its reminder, as they take its sign-up setting.
create function private.event_reminder_from_type()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.service_type_id is not null then
    select t.reminder_days into new.reminder_days
    from public.service_types t where t.id = new.service_type_id;
  end if;
  return new;
end;
$$;
revoke all on function private.event_reminder_from_type() from public, anon, authenticated;
create trigger events_reminder_from_type before insert on public.events
  for each row execute function private.event_reminder_from_type();

create function public.set_service_type_reminder(p_id uuid, p_days integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_capability_anywhere('schedule.manage') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_days is null or p_days not between 1 and 7 then
    raise exception 'invalid_days' using errcode = '22023';
  end if;
  update public.service_types t set reminder_days = p_days
   where t.id = p_id and t.organization_id = private.current_organization_id();
end;
$$;
revoke all on function public.set_service_type_reminder(uuid, integer) from public, anon;
grant execute on function public.set_service_type_reminder(uuid, integer) to authenticated;

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

  -- Serving soon: from 10:00 the chosen number of days before (two unless changed), Winnipeg
  -- time (ADD-SCHED-01).
  for v_row in
    select a.id, a.user_id, a.supervisor_id, e.title, e.starts_at, r.name as role_name,
           pr.display_name as volunteer_name
    from public.event_assignments a
    join public.events e on e.id = a.event_id and e.cancelled_at is null
      and e.source = 'academy'
    join public.serving_roles r on r.id = a.role_id
    join public.profiles pr on pr.id = a.user_id
    cross join lateral (
      select ((((e.starts_at at time zone 'America/Winnipeg')::date - e.reminder_days) + time '10:00')
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

