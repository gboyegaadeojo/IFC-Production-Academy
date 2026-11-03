-- Closes the known gaps in decision 2026-11-01-open-training: anyone can take a course, so leaders'
-- lists, reports and dashboards, and learning nudges, include everyone learning in a department,
-- not only its members. Membership still means "part of this department's team", and taking a
-- course still never adds anyone to a team or approves them to serve.

-- A department's learners: its active members, and active people who have started training there.
-- joined_at is when they joined, or for someone who hasn't, when they started.
create function private.department_learners(p_department_id uuid)
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
revoke all on function private.department_learners(uuid) from public, anon, authenticated;

-- The observer's "who are you assessing" list. Names only.
create or replace function public.assessable_members(p_department_id uuid)
returns table (user_id uuid, display_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.display_name
  from private.department_learners(p_department_id) l
  join public.profiles p on p.id = l.user_id
  where p.status = 'active'
    and private.has_capability('assessment.record', p_department_id)
  order by p.display_name;
$$;

-- Every learner against every live course in the department (SRS-REPORT-001, -002).
create or replace function public.department_training_report(p_department_id uuid)
returns table (
  user_id uuid, display_name text, joined_at timestamptz, course_id uuid, course_title text,
  level_number integer, state text, certificate_reference text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.has_capability('report.view', p_department_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  return query
    select le.user_id, pr.display_name, le.joined_at, c.id, v.title, l.number,
           case
             when private.course_requirements_met(le.user_id, c.id) then 'completed'
             when private.course_learning_met(le.user_id, c.id) then 'awaiting_assessment'
             when exists (select 1 from public.lesson_progress p where p.user_id = le.user_id and p.course_id = c.id)
               or exists (select 1 from public.quiz_attempts a where a.user_id = le.user_id and a.course_id = c.id)
               or exists (select 1 from public.practical_assessments pa where pa.user_id = le.user_id and pa.course_id = c.id)
               then 'in_progress'
             else 'not_started'
           end,
           (select ce.reference from public.certificates ce
             where ce.user_id = le.user_id and ce.course_id = c.id and ce.revoked_at is null)
    from private.department_learners(p_department_id) le
    join public.profiles pr on pr.id = le.user_id
    join public.courses c on c.department_id = p_department_id and c.archived_at is null
    join public.course_versions v on v.course_id = c.id and v.status = 'published'
    join public.levels l on l.id = c.level_id
    order by pr.display_name, l.number, c.sort_order;
end;
$$;

-- Competencies and Approved to Serve per learner (SRS-REPORT-003, -004). One row per learner and
-- competency or role; the kind column says which.
create or replace function public.department_readiness_report(p_department_id uuid)
returns table (
  user_id uuid, display_name text, kind text, name text, state text, since timestamptz,
  expires_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.has_capability('report.view', p_department_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  return query
    select le.user_id, pr.display_name, 'competency'::text, co.name,
           case
             when r.id is null then 'not_assessed'
             when r.status = 'suspended' then 'suspended'
             when r.expires_at is not null and r.expires_at <= now() then 'expired'
             else 'approved'
           end,
           r.granted_at, r.expires_at
    from private.department_learners(p_department_id) le
    join public.profiles pr on pr.id = le.user_id
    join public.competencies co on co.department_id = p_department_id and co.archived_at is null
    left join public.competency_records r on r.user_id = le.user_id and r.competency_id = co.id
    union all
    select le.user_id, pr.display_name, 'role'::text, ro.name,
           case when a.status = 'approved' then 'approved_to_serve' else 'not_approved' end,
           case when a.status = 'approved' then a.approved_at end, null::timestamptz
    from private.department_learners(p_department_id) le
    join public.profiles pr on pr.id = le.user_id
    join public.serving_roles ro on ro.department_id = p_department_id and ro.archived_at is null
    left join public.serving_approvals a on a.user_id = le.user_id and a.role_id = ro.id
    order by 2, 3, 4;
end;
$$;

-- How many learners are Approved to Serve in each role (ADD-REPORT-01). Counts only, no names.
create or replace function public.readiness_matrix()
returns table (
  department_id uuid, department_name text, role_id uuid, role_name text, approved integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select d.id, d.name, r.id, r.name,
         (select count(*)::integer
            from public.serving_approvals a
            join private.department_learners(a.department_id) l on l.user_id = a.user_id
           where a.role_id = r.id and a.status = 'approved')
  from public.departments d
  join public.serving_roles r on r.department_id = d.id and r.archived_at is null
  where d.organization_id = private.current_organization_id()
    and private.is_active_user()
    and private.has_capability('report.view', d.id)
  order by d.sort_order, r.name;
$$;

-- Leader dashboard figures. active_members still counts members; learners also counts people
-- training here who haven't joined, and the stages below are counted across learners.
drop function public.department_training_summary();
create function public.department_training_summary()
returns table (
  department_id uuid,
  department_name text,
  active_members integer,
  learners integer,
  in_progress integer,
  awaiting_assessment integer,
  further_practice integer,
  approved_to_serve integer,
  certificates integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with visible as (
    select d.id, d.name, d.sort_order
    from public.departments d
    where d.organization_id = private.current_organization_id()
      and private.is_active_user()
      and private.can_view_readiness(d.id)
  ),
  learning as (
    select v.id as department_id, l.user_id
    from visible v
    cross join lateral private.department_learners(v.id) l
  ),
  latest as (
    select distinct on (a.user_id, a.course_id, a.practical_key)
           a.user_id, a.course_id, a.practical_key, a.department_id, a.outcome
    from public.practical_assessments a
    join visible v on v.id = a.department_id
    where a.voided_at is null
    order by a.user_id, a.course_id, a.practical_key, a.assessed_at desc, a.created_at desc
  )
  select
    v.id,
    v.name,
    (select count(*)::integer from public.department_memberships m
      where m.department_id = v.id and m.status = 'active'),
    (select count(*)::integer from learning le where le.department_id = v.id),
    (select count(distinct p.user_id)::integer
       from public.lesson_progress p
       join learning le on le.user_id = p.user_id and le.department_id = v.id
      where p.department_id = v.id
        and not exists (
          select 1 from public.certificates c
          where c.user_id = p.user_id and c.course_id = p.course_id and c.revoked_at is null)),
    (select count(distinct r.user_id)::integer
       from public.assessment_requests r
      where r.department_id = v.id and r.closed_at is null),
    (select count(distinct l.user_id)::integer
       from latest l
       join learning le on le.user_id = l.user_id and le.department_id = v.id
      where l.department_id = v.id and l.outcome = 'further_practice'
        and not exists (
          select 1 from public.practical_assessments pa
          where pa.user_id = l.user_id and pa.course_id = l.course_id
            and pa.practical_key = l.practical_key and pa.outcome = 'pass' and pa.voided_at is null)),
    (select count(distinct a.user_id)::integer
       from public.serving_approvals a
       join learning le on le.user_id = a.user_id and le.department_id = v.id
      where a.department_id = v.id and a.status = 'approved'),
    (select count(*)::integer
       from public.certificates c
      where c.department_id = v.id and c.revoked_at is null)
  from visible v
  order by v.sort_order;
$$;
revoke all on function public.department_training_summary() from public, anon;
grant execute on function public.department_training_summary() to authenticated;

-- As in 20261122120000_planning_center.sql, except that "Keep going" no longer needs membership.
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
