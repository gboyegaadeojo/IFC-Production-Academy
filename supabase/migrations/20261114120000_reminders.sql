-- Reminders: SRS-NOTIF-001..006, SRS-SCHED reminders, ADD-NOTIF-01, ADD-SCHED-01, SRS-SOP-004,
-- SRS-COMP-009 (decision 8, docs/decisions/2026-10-31-open-decisions.md).
--
-- * public.queue_reminders() is run by the scheduled email job every 15 minutes, with the service
--   role. It writes notifications that are due; each has a dedupe key, so running it any number of
--   times sends each reminder once.
--     - Please confirm: an assignment still unconfirmed 48 hours after scheduling, for an event
--       more than a day away.
--     - Serving soon: from 10:00 Winnipeg time two days before the event, to the confirmed volunteer
--       and their supervisor, pointing them to their schedule and its SOPs.
--     - Keep going: a course someone started but hasn't touched for 7 days, and again at 21 days,
--       naming the next lesson. Skipped once the course is done, or while they wait for an
--       assessment. A later stall gets its own reminders.
--     - Assessment waiting: a request still open after 7 days goes to the department's leaders.
--     - SOP review overdue: once, 7 days after the review date, if it still isn't reviewed.
--     - Competency expiring: 30 days before, where a competency has expiry turned on.
-- * A request for a practical assessment notifies the department's trainers straight away.
-- * Quiet hours (no email 20:00 to 08:00 Winnipeg time) are applied by the email job, not here.
-- * Functions here are plpgsql because the new enum values can't be used by name until this
--   migration commits.

alter type public.notification_kind add value if not exists 'serving_reminder';
alter type public.notification_kind add value if not exists 'learning_nudge';
alter type public.notification_kind add value if not exists 'assessment_requested';
alter type public.notification_kind add value if not exists 'competency_expiring';

-- People holding a capability for a department through a role scoped to it, or, if nobody does,
-- through an organisation-wide role. Keeps a Production Director's inbox for the gaps.
create function private.department_capability_holders(p_capability text, p_department_id uuid)
returns setof uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return query
    select distinct ur.user_id
    from public.user_roles ur
    join public.role_capabilities rc on rc.role_id = ur.role_id
    join public.capabilities c on c.id = rc.capability_id
    join public.profiles p on p.id = ur.user_id
    where ur.revoked_at is null and p.status = 'active' and c.key = p_capability
      and ur.department_id = p_department_id;
  if not found then
    return query
      select distinct ur.user_id
      from public.user_roles ur
      join public.role_capabilities rc on rc.role_id = ur.role_id
      join public.capabilities c on c.id = rc.capability_id
      join public.profiles p on p.id = ur.user_id
      where ur.revoked_at is null and p.status = 'active' and c.key = p_capability
        and ur.department_id is null;
  end if;
end;
$$;
revoke all on function private.department_capability_holders(text, uuid) from public, anon, authenticated;

-- "Sat Feb 7, 10:30 AM" in Winnipeg time.
create function private.winnipeg_when(p_at timestamptz)
returns text
language sql
immutable
set search_path = ''
as $$
  select to_char(p_at at time zone 'America/Winnipeg', 'Dy Mon FMDD, FMHH12:MI AM');
$$;
revoke all on function private.winnipeg_when(timestamptz) from public, anon, authenticated;

-- A request for a practical assessment tells the department's trainers (ADD-ASSESS-01).
create function private.notify_assessment_requested()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_learner text;
  v_practical text;
  v_holder uuid;
begin
  select display_name into v_learner from public.profiles where id = new.user_id;
  select p.title into v_practical
  from public.practicals p
  join public.course_versions v on v.id = p.course_version_id and v.status = 'published'
  where v.course_id = new.course_id and p.practical_key = new.practical_key;
  for v_holder in
    select * from private.department_capability_holders('assessment.record', new.department_id)
  loop
    continue when v_holder = new.user_id;
    perform private.notify(v_holder, 'assessment_requested',
      coalesce(v_learner, 'A volunteer') || ' is ready for an assessment',
      coalesce(v_practical, 'A practical assessment') || ' is waiting in your assessment queue.',
      '/admin/assessments',
      'assessment_request:' || new.id || ':' || v_holder);
  end loop;
  return null;
end;
$$;
create trigger assessment_requests_notify after insert on public.assessment_requests
  for each row execute function private.notify_assessment_requested();

create function public.queue_reminders()
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
    join public.serving_roles r on r.id = a.role_id
    where a.status = 'pending'
      and a.assigned_at <= now() - interval '48 hours'
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
    join public.department_memberships m
      on m.user_id = l.user_id and m.department_id = l.department_id and m.status = 'active'
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
revoke all on function public.queue_reminders() from public, anon, authenticated;
grant execute on function public.queue_reminders() to service_role;
