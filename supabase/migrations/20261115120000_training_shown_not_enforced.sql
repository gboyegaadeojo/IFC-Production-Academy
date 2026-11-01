-- Training is shown, never enforced (G, 2026-10-31; decision record "Training and serving").
-- People learn at different paces, so not passing never stops anyone serving. Any active member
-- of the department can be scheduled in any role. The assignment records what the scheduler saw:
-- 'approved' (trained), 'supervised' (still learning, with a trained person alongside), or
-- 'learning' (still learning). Conflicts and days away still need schedule.override and a reason.
-- Approved to Serve stays its own record (SRS-COMP-001); it now informs scheduling instead of
-- gating it, which sets aside SRS-COMP-006's block.

alter type public.assignment_readiness add value if not exists 'learning';

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
  v_can_override boolean;
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
  if not exists (
    select 1 from public.department_memberships m join public.profiles pr on pr.id = m.user_id
    where m.user_id = p_user_id and m.department_id = v_position.department_id
      and m.status = 'active' and pr.status = 'active'
  ) then
    raise exception 'volunteer_not_member' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.event_assignments a
    where a.position_id = p_position_id and a.status in ('pending', 'confirmed')
  ) then
    raise exception 'position_filled' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || 'schedule', 0));
  v_can_override := v_reason is not null
    and private.has_capability('schedule.override', v_position.department_id);

  if private.has_schedule_conflict(p_user_id, v_event.id) and not v_can_override then
    raise exception 'schedule_conflict' using errcode = 'P0001';
  end if;
  if private.is_unavailable(p_user_id, v_event.id) and not v_can_override then
    raise exception 'volunteer_unavailable' using errcode = 'P0001';
  end if;

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
     override_reason, assigned_by)
  values (p_position_id, v_event.id, v_position.department_id, v_position.role_id, p_user_id,
          v_readiness, case when v_readiness = 'supervised' then p_supervisor_id end,
          case when v_can_override then v_reason end, (select auth.uid()));
  return v_readiness;
end;
$$;

-- "Not yet", not a fail.
create or replace function private.notify_assessment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text;
begin
  select p.title into v_title from public.practicals p where p.id = new.practical_id;
  perform private.notify(new.user_id, 'assessment_recorded',
    case when new.outcome = 'pass' then 'You passed: ' else 'Assessment feedback: ' end
      || coalesce(v_title, 'practical assessment'),
    case when new.outcome = 'pass'
         then 'Your practical assessment passed.'
         else 'Not yet, and that''s fine. Your trainer''s feedback is waiting, and you can try again when you''re ready.' end,
    '/courses/' || new.course_id || '/practicals/' || new.practical_key,
    'assessment:' || new.id);
  return null;
end;
$$;
