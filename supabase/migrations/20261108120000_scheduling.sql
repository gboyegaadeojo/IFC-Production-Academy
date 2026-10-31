-- Basic scheduling with competency checks: SRS-SCHED-001..011, SRS-COMP-005..008, SPEC §3 workflow D.
--
-- * An event is a service or rehearsal with a start and end. Leaders with schedule.manage add
--   positions for their department's serving roles, one position per person needed.
-- * Assigning someone runs the checks in the database, never in the browser:
--     - they must be an active member of the department;
--     - Approved to Serve for the role, or on supervised practice with a named supervisor who is
--       Approved to Serve for it (SRS-COMP-007), or overridden by someone with schedule.override,
--       with a reason (SRS-COMP-008);
--     - not already serving at an overlapping time, and not marked unavailable that day, unless
--       overridden with a reason.
--   Nothing is assigned silently (SRS-COMP-006). The check result is stored with the assignment.
-- * Volunteers confirm or decline their assignments and mark days they're unavailable.
-- * Every assignment change is audited; overrides keep their reason.

create type public.assignment_status as enum ('pending', 'confirmed', 'declined', 'cancelled');
create type public.assignment_readiness as enum ('approved', 'supervised', 'override');

create function private.has_capability_anywhere(p_capability text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.role_capabilities rc on rc.role_id = ur.role_id
    join public.capabilities c on c.id = rc.capability_id
    join public.profiles p on p.id = ur.user_id
    where ur.user_id = (select auth.uid())
      and ur.revoked_at is null
      and p.status = 'active'
      and c.key = p_capability
  );
$$;
revoke all on function private.has_capability_anywhere(text) from public, anon;
grant execute on function private.has_capability_anywhere(text) to authenticated;

create table public.events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default private.current_organization_id()
    references public.organizations (id) on delete restrict,
  title text not null check (length(trim(title)) between 1 and 120),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  location text not null default '' check (length(location) <= 120),
  notes text not null default '' check (length(notes) <= 1000),
  cancelled_at timestamptz,
  created_by uuid default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_times check (ends_at > starts_at and ends_at <= starts_at + interval '24 hours')
);
create index events_starts_idx on public.events (organization_id, starts_at);

create table public.event_positions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  department_id uuid not null,
  role_id uuid not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  foreign key (role_id, department_id) references public.serving_roles (id, department_id)
);
create index event_positions_event_idx on public.event_positions (event_id);

create table public.event_assignments (
  id uuid primary key default gen_random_uuid(),
  position_id uuid not null references public.event_positions (id) on delete restrict,
  event_id uuid not null references public.events (id) on delete restrict,
  department_id uuid not null references public.departments (id) on delete restrict,
  role_id uuid not null,
  user_id uuid not null references public.profiles (id) on delete restrict,
  status public.assignment_status not null default 'pending',
  -- What the competency check found when assigned (SRS-COMP-005..008).
  readiness public.assignment_readiness not null,
  supervisor_id uuid references public.profiles (id),
  override_reason text check (override_reason is null or length(override_reason) between 1 and 300),
  assigned_by uuid not null references public.profiles (id),
  assigned_at timestamptz not null default now(),
  responded_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_assignments_supervised check ((readiness = 'supervised') = (supervisor_id is not null)),
  constraint event_assignments_override check (readiness <> 'override' or override_reason is not null),
  constraint event_assignments_not_self_supervised check (supervisor_id is null or supervisor_id <> user_id)
);
-- One person per position at a time.
create unique index event_assignments_one_active_idx
  on public.event_assignments (position_id) where status in ('pending', 'confirmed');
create index event_assignments_user_idx on public.event_assignments (user_id, status);

create table public.unavailability (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete restrict,
  starts_on date not null,
  ends_on date not null,
  note text not null default '' check (length(note) <= 200),
  created_at timestamptz not null default now(),
  constraint unavailability_dates check (ends_on >= starts_on and ends_on <= starts_on + 366)
);
create index unavailability_user_idx on public.unavailability (user_id, starts_on);

alter table public.events enable row level security;
alter table public.event_positions enable row level security;
alter table public.event_assignments enable row level security;
alter table public.unavailability enable row level security;

create trigger events_set_updated_at before update on public.events
  for each row execute function private.set_updated_at();
create trigger event_assignments_set_updated_at before update on public.event_assignments
  for each row execute function private.set_updated_at();
create trigger events_audit after insert or update on public.events
  for each row execute function private.audit_change('event');
create trigger event_assignments_audit after insert or update on public.event_assignments
  for each row execute function private.audit_change('event_assignment');

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------

-- Service times aren't private: anyone active in the organization can see events and positions.
create policy "Active users read events"
  on public.events for select to authenticated
  using (private.is_active_user() and organization_id = private.current_organization_id());
create policy "Schedulers add events"
  on public.events for insert to authenticated
  with check (private.has_capability_anywhere('schedule.manage')
              and organization_id = private.current_organization_id());
create policy "Schedulers edit events"
  on public.events for update to authenticated
  using (private.has_capability_anywhere('schedule.manage'))
  with check (private.has_capability_anywhere('schedule.manage'));

create policy "Active users read positions"
  on public.event_positions for select to authenticated
  using (exists (select 1 from public.events e where e.id = event_id));

create policy "People read their own assignments; schedulers and leaders read their department's"
  on public.event_assignments for select to authenticated
  using (
    (user_id = (select auth.uid()) and private.is_active_user())
    or private.has_capability('schedule.manage', department_id)
    or private.can_view_readiness(department_id)
  );

-- Schedulers see unavailability for people in departments they schedule, so they can plan.
create policy "People read their own unavailability; schedulers read their members'"
  on public.unavailability for select to authenticated
  using (
    (user_id = (select auth.uid()) and private.is_active_user())
    or exists (
      select 1 from public.department_memberships m
      where m.user_id = unavailability.user_id and m.status = 'active'
        and private.has_capability('schedule.manage', m.department_id)
    )
  );

grant select on public.events, public.event_positions, public.event_assignments,
  public.unavailability to authenticated;
grant insert (title, starts_at, ends_at, location, notes) on public.events to authenticated;
grant update (title, starts_at, ends_at, location, notes) on public.events to authenticated;

-- ---------------------------------------------------------------------------
-- Checks
-- ---------------------------------------------------------------------------

-- Approved to Serve for a role right now: the stored approval, with expiry brought up to date.
create function private.is_approved_for_role(p_user_id uuid, p_role_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_department_id uuid;
begin
  select r.department_id into v_department_id from public.serving_roles r where r.id = p_role_id;
  if v_department_id is null then
    return false;
  end if;
  perform private.refresh_serving_approvals(p_user_id, v_department_id);
  return exists (
    select 1 from public.serving_approvals a
    where a.user_id = p_user_id and a.role_id = p_role_id and a.status = 'approved'
  );
end;
$$;
revoke all on function private.is_approved_for_role(uuid, uuid) from public, anon, authenticated;

create function private.has_schedule_conflict(p_user_id uuid, p_event_id uuid)
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
      and other.starts_at < this.ends_at and this.starts_at < other.ends_at
  );
$$;
revoke all on function private.has_schedule_conflict(uuid, uuid) from public, anon, authenticated;

-- Unavailable on the event's day in Winnipeg (dates are local, SPEC §5 "Integrity").
create function private.is_unavailable(p_user_id uuid, p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.unavailability u
    join public.events e on e.id = p_event_id
    where u.user_id = p_user_id
      and (e.starts_at at time zone 'America/Winnipeg')::date between u.starts_on and u.ends_on
  );
$$;
revoke all on function private.is_unavailable(uuid, uuid) from public, anon, authenticated;

-- The people a scheduler can place in a position, with what the checks would say (names only).
create function public.schedule_candidates(p_position_id uuid)
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
    select pr.id, pr.display_name,
           private.is_approved_for_role(pr.id, v_position.role_id),
           private.has_schedule_conflict(pr.id, v_position.event_id),
           private.is_unavailable(pr.id, v_position.event_id)
    from public.department_memberships m
    join public.profiles pr on pr.id = m.user_id
    where m.department_id = v_position.department_id and m.status = 'active' and pr.status = 'active'
    order by pr.display_name;
end;
$$;

-- ---------------------------------------------------------------------------
-- Scheduler actions
-- ---------------------------------------------------------------------------

create function public.add_event_position(p_event_id uuid, p_role_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.serving_roles;
  v_event public.events;
  v_id uuid;
begin
  select * into v_role from public.serving_roles r where r.id = p_role_id and r.archived_at is null;
  select * into v_event from public.events e
   where e.id = p_event_id and e.organization_id = private.current_organization_id();
  if v_role.id is null or v_event.id is null
     or not private.has_capability('schedule.manage', v_role.department_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if v_event.cancelled_at is not null or v_event.ends_at <= now() then
    raise exception 'event_closed' using errcode = 'P0001';
  end if;
  insert into public.event_positions (event_id, department_id, role_id, sort_order)
  values (p_event_id, v_role.department_id, p_role_id,
          coalesce((select max(p.sort_order) from public.event_positions p where p.event_id = p_event_id), 0) + 10)
  returning id into v_id;
  return v_id;
end;
$$;

-- Removes an unfilled position. Filled ones keep their history; cancel the assignment first.
create function public.remove_event_position(p_position_id uuid)
returns void
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
  if exists (select 1 from public.event_assignments a where a.position_id = p_position_id) then
    raise exception 'position_has_history' using errcode = 'P0001';
  end if;
  delete from public.event_positions p where p.id = p_position_id;
end;
$$;

-- Workflow D: assigns a volunteer after every check. Returns the readiness the check found.
create function public.assign_to_position(
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
  elsif v_can_override then
    v_readiness := 'override';
  else
    raise exception 'not_approved_for_role' using errcode = 'P0001';
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

create function public.cancel_assignment(p_assignment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assignment public.event_assignments;
begin
  select * into v_assignment from public.event_assignments a where a.id = p_assignment_id for update;
  if v_assignment.id is null or not private.has_capability('schedule.manage', v_assignment.department_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  update public.event_assignments a set status = 'cancelled', cancelled_at = now()
   where a.id = p_assignment_id and a.status in ('pending', 'confirmed');
end;
$$;

create function public.cancel_event(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_capability_anywhere('schedule.manage') or not exists (
    select 1 from public.events e
    where e.id = p_event_id and e.organization_id = private.current_organization_id()
  ) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  update public.events e set cancelled_at = now() where e.id = p_event_id and e.cancelled_at is null;
  update public.event_assignments a set status = 'cancelled', cancelled_at = now()
   where a.event_id = p_event_id and a.status in ('pending', 'confirmed');
end;
$$;

-- ---------------------------------------------------------------------------
-- Volunteer actions
-- ---------------------------------------------------------------------------

-- Confirms or declines the caller's own assignment for an event that hasn't happened yet.
create function public.respond_to_assignment(p_assignment_id uuid, p_response public.assignment_status)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assignment public.event_assignments;
begin
  if p_response not in ('confirmed', 'declined') then
    raise exception 'invalid_response' using errcode = '22023';
  end if;
  select * into v_assignment from public.event_assignments a
   where a.id = p_assignment_id and a.user_id = (select auth.uid()) for update;
  if v_assignment.id is null or not private.is_active_user() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if v_assignment.status not in ('pending', 'confirmed')
     or exists (select 1 from public.events e where e.id = v_assignment.event_id
                and (e.cancelled_at is not null or e.ends_at <= now())) then
    raise exception 'assignment_closed' using errcode = 'P0001';
  end if;
  update public.event_assignments a set status = p_response, responded_at = now()
   where a.id = p_assignment_id;
end;
$$;

create function public.add_unavailability(p_starts_on date, p_ends_on date, p_note text default '')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not private.is_active_user() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_starts_on is null or p_ends_on is null or p_ends_on < p_starts_on
     or p_ends_on > p_starts_on + 366 or length(coalesce(p_note, '')) > 200 then
    raise exception 'invalid_dates' using errcode = '22023';
  end if;
  insert into public.unavailability (user_id, starts_on, ends_on, note)
  values ((select auth.uid()), p_starts_on, p_ends_on, trim(coalesce(p_note, '')))
  returning id into v_id;
  return v_id;
end;
$$;

create function public.remove_unavailability(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.unavailability u where u.id = p_id and u.user_id = (select auth.uid());
end;
$$;

do $$
declare
  v_function text;
begin
  foreach v_function in array array[
    'public.schedule_candidates(uuid)',
    'public.add_event_position(uuid, uuid)',
    'public.remove_event_position(uuid)',
    'public.assign_to_position(uuid, uuid, uuid, text)',
    'public.cancel_assignment(uuid)',
    'public.cancel_event(uuid)',
    'public.respond_to_assignment(uuid, public.assignment_status)',
    'public.add_unavailability(date, date, text)',
    'public.remove_unavailability(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', v_function);
    execute format('grant execute on function %s to authenticated', v_function);
  end loop;
end;
$$;
