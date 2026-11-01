-- Position teams (G, 2026-10-31; decision record 9). This mirrors how IFC already schedules in
-- Planning Center Services, where people are added to each position (Audio, Camera 1, Camera 2,
-- ProPresenter...) and a position can only be filled from the people added to it:
--
-- * Each serving role (position) has a team: the people who serve in it. Joining a department is
--   for learning; being on a position's team is what lets someone be scheduled in it. People learn
--   at their own pace, and whoever runs the teams (team.manage) adds them when they're ready.
-- * A scheduler can only schedule someone on that position's team, on a day they haven't blocked
--   out, and not when they're already serving in the production team that day. schedule.override
--   with a reason still covers a blocked day or a second position; nothing overrides the team rule.
-- * Training stays visible ("Trained" or "Still learning") but never decides it.
-- * The Scheduling Administrator role runs the teams and the schedule across every department.

insert into public.capabilities (key, description)
values ('team.manage', 'Add and remove people on a department''s position teams')
on conflict (key) do nothing;

update public.capabilities
   set description = 'Schedule someone on a day they''re away or already serving, with a reason'
 where key = 'schedule.override';

insert into public.roles (organization_id, key, name, description, department_scoped)
select o.id, 'scheduling_admin', 'Scheduling Administrator',
       'Sets up position teams and builds the schedule for every department.', false
from public.organizations o
on conflict do nothing;

insert into public.role_capabilities (role_id, capability_id)
select r.id, c.id
from public.roles r
join public.capabilities c on c.key in ('team.manage', 'schedule.manage', 'schedule.override')
where r.key = 'scheduling_admin'
on conflict do nothing;

insert into public.role_capabilities (role_id, capability_id)
select r.id, c.id
from public.roles r, public.capabilities c
where r.key in ('department_leader', 'production_director') and c.key = 'team.manage'
on conflict do nothing;

-- Schedulers and team managers see the department's positions and the names of its members,
-- which they need to build teams and fill positions.
create policy "Schedulers and team managers read serving roles"
  on public.serving_roles for select to authenticated
  using (
    private.has_capability('schedule.manage', department_id)
    or private.has_capability('team.manage', department_id)
  );

create or replace function private.can_view_profile(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    p_profile_id = (select auth.uid())
    or private.has_capability('user.manage')
    or private.has_capability('role.assign')
    or exists (
      select 1 from public.department_memberships m
      where m.user_id = p_profile_id
        and (private.has_capability('member.approve', m.department_id)
             or private.has_capability('schedule.manage', m.department_id)
             or private.has_capability('team.manage', m.department_id))
    );
$$;

-- ---------------------------------------------------------------------------
-- Position teams
-- ---------------------------------------------------------------------------

create table public.serving_team_members (
  id uuid primary key default gen_random_uuid(),
  role_id uuid not null,
  department_id uuid not null,
  user_id uuid not null references public.profiles (id) on delete restrict,
  added_at timestamptz not null default now(),
  added_by uuid references public.profiles (id),
  removed_at timestamptz,
  removed_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (role_id, department_id) references public.serving_roles (id, department_id)
);
-- One open place per person per position. Removed rows stay as history.
create unique index serving_team_members_one_open_idx
  on public.serving_team_members (role_id, user_id) where removed_at is null;
create index serving_team_members_department_idx on public.serving_team_members (department_id);
create index serving_team_members_user_idx on public.serving_team_members (user_id);

alter table public.serving_team_members enable row level security;

create policy serving_team_members_select on public.serving_team_members
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or private.has_capability('team.manage', department_id)
    or private.has_capability('schedule.manage', department_id)
    or private.has_capability('member.approve', department_id)
  );
grant select on public.serving_team_members to authenticated;

create trigger serving_team_members_set_updated_at before update on public.serving_team_members
  for each row execute function private.set_updated_at();
create trigger serving_team_members_audit after insert or update on public.serving_team_members
  for each row execute function private.audit_change('serving_team_member');

create function private.is_on_position_team(p_user_id uuid, p_role_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.serving_team_members t
    join public.department_memberships m
      on m.user_id = t.user_id and m.department_id = t.department_id and m.status = 'active'
    join public.profiles p on p.id = t.user_id and p.status = 'active'
    where t.user_id = p_user_id and t.role_id = p_role_id and t.removed_at is null
  );
$$;
revoke all on function private.is_on_position_team(uuid, uuid) from public, anon, authenticated;

-- Adds someone to a position's team. If they aren't a member of the department yet, they join it
-- too, so people who already serve can be added without taking the Academy's course first.
create function public.add_to_serving_team(p_role_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_role public.serving_roles;
begin
  select * into v_role from public.serving_roles r where r.id = p_role_id;
  if v_role.id is null or not private.has_capability('team.manage', v_role.department_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if v_role.archived_at is not null then
    raise exception 'role_archived' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.profiles p
    join public.departments d on d.id = v_role.department_id and d.organization_id = p.organization_id
    where p.id = p_user_id and p.status = 'active'
  ) then
    raise exception 'person_not_active' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.department_memberships m
    where m.user_id = p_user_id and m.department_id = v_role.department_id and m.status = 'active'
  ) then
    -- A waiting request becomes the membership; otherwise a new one starts.
    update public.department_memberships m
       set status = 'active', decided_at = now(), decided_by = v_actor,
           decision_reason = 'Added to a position team'
     where m.user_id = p_user_id and m.department_id = v_role.department_id and m.status = 'requested';
    if not found then
      insert into public.department_memberships
        (department_id, user_id, status, decided_at, decided_by, decision_reason)
      values (v_role.department_id, p_user_id, 'active', now(), v_actor, 'Added to a position team');
    end if;
  end if;

  insert into public.serving_team_members (role_id, department_id, user_id, added_by)
  values (p_role_id, v_role.department_id, p_user_id, v_actor)
  on conflict (role_id, user_id) where removed_at is null do nothing;
end;
$$;
revoke all on function public.add_to_serving_team(uuid, uuid) from public, anon;
grant execute on function public.add_to_serving_team(uuid, uuid) to authenticated;

-- Takes someone off a position's team. Their training and past serving stay; upcoming
-- assignments stay for the scheduler to change.
create function public.remove_from_serving_team(p_role_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_department_id uuid;
begin
  select r.department_id into v_department_id from public.serving_roles r where r.id = p_role_id;
  if v_department_id is null or not private.has_capability('team.manage', v_department_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  update public.serving_team_members t
     set removed_at = now(), removed_by = (select auth.uid())
   where t.role_id = p_role_id and t.user_id = p_user_id and t.removed_at is null;
end;
$$;
revoke all on function public.remove_from_serving_team(uuid, uuid) from public, anon;
grant execute on function public.remove_from_serving_team(uuid, uuid) to authenticated;

-- Leaving a department also takes someone off its position teams.
create function private.end_serving_teams_on_leave()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.serving_team_members t
     set removed_at = now(), removed_by = (select auth.uid())
   where t.department_id = new.department_id and t.user_id = new.user_id and t.removed_at is null;
  return null;
end;
$$;
create trigger department_memberships_end_serving_teams
  after update of status on public.department_memberships
  for each row when (old.status = 'active' and new.status <> 'active')
  execute function private.end_serving_teams_on_leave();

-- Everyone a team manager might add, with the department's positions they're on and trained for.
-- Names only, no emails.
create function public.serving_team_overview(p_department_id uuid)
returns table (
  user_id uuid,
  display_name text,
  is_member boolean,
  team_role_ids uuid[],
  trained_role_ids uuid[]
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.has_capability('team.manage', p_department_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  return query
    select p.id,
           p.display_name,
           exists (
             select 1 from public.department_memberships m
             where m.user_id = p.id and m.department_id = p_department_id and m.status = 'active'
           ),
           coalesce((
             select array_agg(t.role_id)
             from public.serving_team_members t
             where t.user_id = p.id and t.department_id = p_department_id and t.removed_at is null
           ), '{}'),
           coalesce((
             select array_agg(a.role_id)
             from public.serving_approvals a
             where a.user_id = p.id and a.department_id = p_department_id and a.status = 'approved'
           ), '{}')
    from public.profiles p
    join public.departments d on d.id = p_department_id and d.organization_id = p.organization_id
    where p.status = 'active'
    order by p.display_name;
end;
$$;
revoke all on function public.serving_team_overview(uuid) from public, anon;
grant execute on function public.serving_team_overview(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Scheduling checks
-- ---------------------------------------------------------------------------

-- One position a day: already serving that Winnipeg day, or at an overlapping time.
create function private.is_serving_that_day(p_user_id uuid, p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.event_assignments a
    join public.events other on other.id = a.event_id
    join public.events this on this.id = p_event_id
    where a.user_id = p_user_id
      and a.status in ('pending', 'confirmed')
      and other.cancelled_at is null
      and (
        (other.starts_at < this.ends_at and this.starts_at < other.ends_at)
        or (other.starts_at at time zone 'America/Winnipeg')::date
             = (this.starts_at at time zone 'America/Winnipeg')::date
      )
  );
$$;
revoke all on function private.is_serving_that_day(uuid, uuid) from public, anon, authenticated;

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
  if not private.is_on_position_team(p_user_id, v_position.role_id) then
    raise exception 'not_on_team' using errcode = 'P0001';
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

  if private.is_serving_that_day(p_user_id, v_event.id) and not v_can_override then
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

-- Only the position's team is offered: free people first, then trained before still learning.
create or replace function public.schedule_candidates(p_position_id uuid)
returns table (user_id uuid, display_name text, approved boolean, conflict boolean, unavailable boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_position public.event_positions;
begin
  select * into v_position from public.event_positions p where p.id = p_position_id;
  if v_position.id is null or not private.has_capability('schedule.manage', v_position.department_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  return query
    select c.id, c.display_name, c.approved, c.conflict, c.unavailable
    from (
      select pr.id, pr.display_name,
             private.is_approved_for_role(pr.id, v_position.role_id) as approved,
             private.is_serving_that_day(pr.id, v_position.event_id) as conflict,
             private.is_unavailable(pr.id, v_position.event_id) as unavailable
      from public.serving_team_members t
      join public.department_memberships m
        on m.user_id = t.user_id and m.department_id = t.department_id and m.status = 'active'
      join public.profiles pr on pr.id = t.user_id and pr.status = 'active'
      where t.role_id = v_position.role_id and t.removed_at is null
    ) c
    order by (c.conflict or c.unavailable), not c.approved, c.display_name;
end;
$$;
