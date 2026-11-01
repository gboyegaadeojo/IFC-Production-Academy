-- Training is open to everyone in the Academy (G, 2026-11-01; docs/decisions/2026-11-01-open-training.md).
-- Anyone with an active account can open any published course in a department that isn't hidden:
-- read its lessons and SOPs, record progress, take quizzes, ask for a practical and get a
-- certificate. Department membership stays exactly as it is for everything else: asking to join,
-- position teams, leaders' lists and notifications. Approval to serve still comes only from passed
-- practicals, and team leaders still decide who serves.

-- Who may learn in a department: any active person, unless the department is hidden.
create function private.can_learn(p_department_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_active_user() and exists (
    select 1 from public.departments d
    where d.id = p_department_id and d.status in ('active', 'coming_soon')
      and d.organization_id = private.current_organization_id()
  );
$$;
revoke all on function private.can_learn(uuid) from public, anon;
grant execute on function private.can_learn(uuid) to authenticated;

-- Every caller of is_department_member guards training (lessons, progress, quizzes, SOPs and their
-- files, competencies, practical requests, certificates), so it now means "may learn here". The
-- name is kept so those policies and functions don't all need rewriting; real membership is still
-- read from department_memberships wherever it matters.
create or replace function private.is_department_member(p_department_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can_learn(p_department_id);
$$;

-- Leaders can assess anyone who asked, member or not.
create or replace function public.record_practical_assessment(
  p_course_id uuid,
  p_practical_key uuid,
  p_learner_id uuid,
  p_observed_criterion_ids uuid[],
  p_feedback text default ''
)
returns table (assessment_id uuid, outcome public.practical_outcome)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_observer uuid := (select auth.uid());
  v_practical public.practicals;
  v_department_id uuid;
  v_observed uuid[];
  v_count integer;
  v_required integer;
  v_required_observed integer;
  v_observed_count integer;
  v_outcome public.practical_outcome;
  v_last public.practical_assessments;
  v_id uuid;
  v_name text;
begin
  v_practical := private.live_practical(p_course_id, p_practical_key);
  v_department_id := private.course_version_department(v_practical.course_version_id);
  if v_practical.id is null or not private.has_capability('assessment.record', v_department_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_learner_id = v_observer then
    raise exception 'cannot_assess_self' using errcode = '42501';
  end if;
  -- Anyone with an active account may be assessed: training is open to all (2026-11-01).
  if not exists (select 1 from public.profiles p where p.id = p_learner_id and p.status = 'active') then
    raise exception 'learner_not_active' using errcode = 'P0001';
  end if;
  if length(coalesce(p_feedback, '')) > 2000 then
    raise exception 'invalid_feedback' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_learner_id::text || p_course_id::text || p_practical_key::text, 0));

  select * into v_last from public.practical_assessments a
   where a.user_id = p_learner_id and a.course_id = p_course_id and a.practical_key = p_practical_key
     and a.voided_at is null
   order by a.assessed_at desc limit 1;
  if exists (
    select 1 from public.practical_assessments a
    where a.user_id = p_learner_id and a.course_id = p_course_id
      and a.practical_key = p_practical_key and a.outcome = 'pass' and a.voided_at is null
  ) then
    raise exception 'already_passed' using errcode = 'P0001';
  end if;
  if v_last.id is not null and v_practical.retry_wait_days > 0
     and v_last.assessed_at > now() - make_interval(days => v_practical.retry_wait_days) then
    raise exception 'reassessment_too_soon' using errcode = 'P0001';
  end if;

  select count(*), count(*) filter (where pc.is_required),
         count(*) filter (where pc.is_required and pc.id = any (coalesce(p_observed_criterion_ids, '{}'))),
         count(*) filter (where pc.id = any (coalesce(p_observed_criterion_ids, '{}'))),
         coalesce(array_agg(pc.id order by pc.sort_order, pc.id)
                  filter (where pc.id = any (coalesce(p_observed_criterion_ids, '{}'))), '{}')
    into v_count, v_required, v_required_observed, v_observed_count, v_observed
    from public.practical_criteria pc
   where pc.practical_id = v_practical.id;
  if v_count = 0 then
    raise exception 'practical_has_no_criteria' using errcode = 'P0001';
  end if;

  v_outcome := case
    when (not v_practical.require_all_required or v_required_observed = v_required)
         and v_observed_count * 100 >= v_practical.pass_min_percent * v_count
    then 'pass'::public.practical_outcome
    else 'further_practice'::public.practical_outcome
  end;

  select p.display_name into v_name from public.profiles p where p.id = v_observer;
  insert into public.practical_assessments
    (user_id, observer_id, observer_name, practical_id, practical_key, course_id, course_version_id,
     department_id, competency_id, observed_criterion_ids, criteria_count, required_count,
     required_observed, observed_count, require_all_required, pass_min_percent, outcome, feedback)
  values (p_learner_id, v_observer, coalesce(v_name, 'Observer'), v_practical.id, p_practical_key,
          p_course_id, v_practical.course_version_id, v_department_id, v_practical.competency_id,
          v_observed, v_count, v_required, v_required_observed, v_observed_count,
          v_practical.require_all_required, v_practical.pass_min_percent, v_outcome,
          trim(coalesce(p_feedback, '')))
  returning id into v_id;

  update public.assessment_requests r
     set closed_at = now(), closed_by_assessment_id = v_id
   where r.user_id = p_learner_id and r.course_id = p_course_id
     and r.practical_key = p_practical_key and r.closed_at is null;

  if v_outcome = 'pass' and v_practical.competency_id is not null then
    perform private.grant_competency(p_learner_id, v_practical.competency_id, v_id);
  end if;

  return query select v_id, v_outcome;
end;
$$;
