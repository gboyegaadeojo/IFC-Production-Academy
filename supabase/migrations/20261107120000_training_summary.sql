-- Leader dashboard figures (SPEC §7 "Leader dashboard", DESIGN §7.1). Counts only, never names,
-- for each department the caller can see readiness in (trainers, leaders, report viewers). Every
-- figure is worked out from real records; nothing is estimated.
--
--   active_members       active memberships
--   in_progress          active members who have opened a lesson in a course they have no
--                        certificate for yet
--   awaiting_assessment  people with an open request for a practical assessment
--   further_practice     active members whose latest assessment on a practical they haven't passed
--                        was Further practice required
--   approved_to_serve    active members Approved to Serve in at least one role
--   certificates         valid certificates issued

create function public.department_training_summary()
returns table (
  department_id uuid,
  department_name text,
  active_members integer,
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
  members as (
    select m.department_id, m.user_id
    from public.department_memberships m
    join visible v on v.id = m.department_id
    where m.status = 'active'
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
    (select count(*)::integer from members m where m.department_id = v.id),
    (select count(distinct p.user_id)::integer
       from public.lesson_progress p
       join members m on m.user_id = p.user_id and m.department_id = v.id
      where p.department_id = v.id
        and not exists (
          select 1 from public.certificates c
          where c.user_id = p.user_id and c.course_id = p.course_id and c.revoked_at is null)),
    (select count(distinct r.user_id)::integer
       from public.assessment_requests r
      where r.department_id = v.id and r.closed_at is null),
    (select count(distinct l.user_id)::integer
       from latest l
       join members m on m.user_id = l.user_id and m.department_id = v.id
      where l.department_id = v.id and l.outcome = 'further_practice'
        and not exists (
          select 1 from public.practical_assessments pa
          where pa.user_id = l.user_id and pa.course_id = l.course_id
            and pa.practical_key = l.practical_key and pa.outcome = 'pass' and pa.voided_at is null)),
    (select count(distinct a.user_id)::integer
       from public.serving_approvals a
       join members m on m.user_id = a.user_id and m.department_id = v.id
      where a.department_id = v.id and a.status = 'approved'),
    (select count(*)::integer
       from public.certificates c
      where c.department_id = v.id and c.revoked_at is null)
  from visible v
  order by v.sort_order;
$$;

revoke all on function public.department_training_summary() from public, anon;
grant execute on function public.department_training_summary() to authenticated;
