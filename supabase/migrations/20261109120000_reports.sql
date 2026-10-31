-- Reports and exports: SRS-REPORT-001..007, SRS-AUDIT-001.
--
-- * Department reports keep the three records apart (SPEC §3): course completion, competency, and
--   Approved to Serve. Each report function needs report.view for the department and returns only
--   names and training facts, never emails or mentoring notes (SRS-REPORT-005, SRS-RBAC-006).
-- * Course state uses the same rules as the learner's course page and the certificate check:
--   completed when every requirement on the live version is met; awaiting assessment when only
--   required practicals are left; in progress once anything is started.
-- * Exports need report.export and are audited (log_report_export).

-- Required lessons (or all, when none is required) and required quizzes on the live version.
create function private.course_learning_met(p_user_id uuid, p_course_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with live as (
    select v.id
    from public.course_versions v
    join public.courses c on c.id = v.course_id
    where v.course_id = p_course_id and v.status = 'published' and c.archived_at is null
  ),
  counted_lessons as (
    select l.lesson_key
    from public.lessons l
    where l.course_version_id = (select id from live)
      and (l.is_required or not exists (
        select 1 from public.lessons r where r.course_version_id = (select id from live) and r.is_required))
  )
  select exists (select 1 from live)
    and exists (select 1 from counted_lessons)
    and not exists (
      select 1 from counted_lessons cl
      where not exists (
        select 1 from public.lesson_progress p
        where p.user_id = p_user_id and p.course_id = p_course_id
          and p.lesson_key = cl.lesson_key and p.status = 'completed'))
    and not exists (
      select 1 from public.quizzes q
      where q.course_version_id = (select id from live) and q.is_required
        and not exists (
          select 1 from public.quiz_attempts a
          where a.user_id = p_user_id and a.course_id = p_course_id
            and a.quiz_key = q.quiz_key and a.passed));
$$;
revoke all on function private.course_learning_met(uuid, uuid) from public, anon, authenticated;

-- Every active member against every live course in the department (SRS-REPORT-001, -002).
create function public.department_training_report(p_department_id uuid)
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
    select m.user_id, pr.display_name, coalesce(m.decided_at, m.created_at), c.id, v.title, l.number,
           case
             when private.course_requirements_met(m.user_id, c.id) then 'completed'
             when private.course_learning_met(m.user_id, c.id) then 'awaiting_assessment'
             when exists (select 1 from public.lesson_progress p where p.user_id = m.user_id and p.course_id = c.id)
               or exists (select 1 from public.quiz_attempts a where a.user_id = m.user_id and a.course_id = c.id)
               or exists (select 1 from public.practical_assessments pa where pa.user_id = m.user_id and pa.course_id = c.id)
               then 'in_progress'
             else 'not_started'
           end,
           (select ce.reference from public.certificates ce
             where ce.user_id = m.user_id and ce.course_id = c.id and ce.revoked_at is null)
    from public.department_memberships m
    join public.profiles pr on pr.id = m.user_id
    join public.courses c on c.department_id = m.department_id and c.archived_at is null
    join public.course_versions v on v.course_id = c.id and v.status = 'published'
    join public.levels l on l.id = c.level_id
    where m.department_id = p_department_id and m.status = 'active'
    order by pr.display_name, l.number, c.sort_order;
end;
$$;

-- Competencies and Approved to Serve per active member (SRS-REPORT-003, -004). One row per
-- member and competency or role; the kind column says which.
create function public.department_readiness_report(p_department_id uuid)
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
    select m.user_id, pr.display_name, 'competency'::text, co.name,
           case
             when r.id is null then 'not_assessed'
             when r.status = 'suspended' then 'suspended'
             when r.expires_at is not null and r.expires_at <= now() then 'expired'
             else 'approved'
           end,
           r.granted_at, r.expires_at
    from public.department_memberships m
    join public.profiles pr on pr.id = m.user_id
    join public.competencies co on co.department_id = m.department_id and co.archived_at is null
    left join public.competency_records r on r.user_id = m.user_id and r.competency_id = co.id
    where m.department_id = p_department_id and m.status = 'active'
    union all
    select m.user_id, pr.display_name, 'role'::text, ro.name,
           case when a.status = 'approved' then 'approved_to_serve' else 'not_approved' end,
           case when a.status = 'approved' then a.approved_at end, null::timestamptz
    from public.department_memberships m
    join public.profiles pr on pr.id = m.user_id
    join public.serving_roles ro on ro.department_id = m.department_id and ro.archived_at is null
    left join public.serving_approvals a on a.user_id = m.user_id and a.role_id = ro.id
    where m.department_id = p_department_id and m.status = 'active'
    order by 2, 3, 4;
end;
$$;

-- Records that someone exported a report (SRS-REPORT-006, SRS-AUDIT-001). Needs report.export.
create function public.log_report_export(p_department_id uuid, p_report text, p_rows integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_capability('report.export', p_department_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_report not in ('training', 'readiness') then
    raise exception 'invalid_report' using errcode = '22023';
  end if;
  insert into public.audit_events
    (organization_id, actor_id, action, target_table, target_id, department_id, metadata)
  values (private.current_organization_id(), (select auth.uid()), 'report.exported', 'departments',
          p_department_id, p_department_id,
          jsonb_build_object('report', p_report, 'rows', greatest(coalesce(p_rows, 0), 0)));
end;
$$;

do $$
declare
  v_function text;
begin
  foreach v_function in array array[
    'public.department_training_report(uuid)',
    'public.department_readiness_report(uuid)',
    'public.log_report_export(uuid, text, integer)'
  ] loop
    execute format('revoke all on function %s from public, anon', v_function);
    execute format('grant execute on function %s to authenticated', v_function);
  end loop;
end;
$$;
