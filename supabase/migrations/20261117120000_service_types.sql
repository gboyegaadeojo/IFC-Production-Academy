-- Service types and calendars (decision record 9, stage 1). As in Planning Center Services:
--
-- * A service type ("Sunday service", "Communion service") has a usual start time, length,
--   location, and the positions it needs. Schedulers set it up once.
-- * create_services makes dated services from it in one step, each with its positions, skipping
--   dates that already have one. Each service is an ordinary event, so everything built on events
--   (assignments, reminders, calendar files) works unchanged.
-- * event_team lets someone see who else is serving at a service they're scheduled for (names,
--   positions, and replies only), as Planning Center shows a volunteer their team.

create table public.service_types (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default private.current_organization_id()
    references public.organizations (id) on delete restrict,
  name text not null check (length(trim(name)) between 1 and 80),
  start_time time not null,
  duration_minutes integer not null default 120 check (duration_minutes between 15 and 720),
  location text not null default '' check (length(location) <= 120),
  notes text not null default '' check (length(notes) <= 1000),
  archived_at timestamptz,
  created_by uuid default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index service_types_name_idx
  on public.service_types (organization_id, lower(trim(name))) where archived_at is null;

create table public.service_type_positions (
  id uuid primary key default gen_random_uuid(),
  service_type_id uuid not null references public.service_types (id) on delete cascade,
  role_id uuid not null,
  department_id uuid not null,
  sort_order integer not null,
  created_at timestamptz not null default now(),
  foreign key (role_id, department_id) references public.serving_roles (id, department_id)
);
create index service_type_positions_type_idx on public.service_type_positions (service_type_id, sort_order);

alter table public.events add column service_type_id uuid references public.service_types (id);
create index events_service_type_idx on public.events (service_type_id, starts_at);

alter table public.service_types enable row level security;
alter table public.service_type_positions enable row level security;

-- Service types aren't private, like events.
create policy "Active users read service types"
  on public.service_types for select to authenticated
  using (private.is_active_user() and organization_id = private.current_organization_id());
create policy "Active users read service type positions"
  on public.service_type_positions for select to authenticated
  using (exists (select 1 from public.service_types t where t.id = service_type_id));
grant select on public.service_types, public.service_type_positions to authenticated;

create trigger service_types_set_updated_at before update on public.service_types
  for each row execute function private.set_updated_at();
create trigger service_types_audit after insert or update on public.service_types
  for each row execute function private.audit_change('service_type');

-- Creates or updates a service type. Anyone who schedules can; positions are checked per department.
create function public.save_service_type(
  p_id uuid,
  p_name text,
  p_start_time time,
  p_duration_minutes integer,
  p_location text,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not private.has_capability_anywhere('schedule.manage') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.service_types t
    where t.organization_id = private.current_organization_id() and t.archived_at is null
      and lower(trim(t.name)) = lower(trim(p_name)) and t.id is distinct from p_id
  ) then
    raise exception 'duplicate_name' using errcode = 'P0001';
  end if;
  if p_id is null then
    insert into public.service_types (name, start_time, duration_minutes, location, notes)
    values (trim(p_name), p_start_time, p_duration_minutes, trim(p_location), trim(p_notes))
    returning id into v_id;
  else
    update public.service_types t
       set name = trim(p_name), start_time = p_start_time, duration_minutes = p_duration_minutes,
           location = trim(p_location), notes = trim(p_notes)
     where t.id = p_id and t.organization_id = private.current_organization_id()
       and t.archived_at is null
    returning t.id into v_id;
    if v_id is null then
      raise exception 'not_found' using errcode = 'P0001';
    end if;
  end if;
  return v_id;
end;
$$;

create function public.archive_service_type(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_capability_anywhere('schedule.manage') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  update public.service_types t set archived_at = now()
   where t.id = p_id and t.organization_id = private.current_organization_id()
     and t.archived_at is null;
end;
$$;

-- Replaces the positions a service type needs, in order. Repeat a role to need it twice.
create function public.set_service_type_positions(p_id uuid, p_role_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role_id uuid;
  v_role public.serving_roles;
  v_order integer := 0;
begin
  if not private.has_capability_anywhere('schedule.manage') or not exists (
    select 1 from public.service_types t
    where t.id = p_id and t.organization_id = private.current_organization_id()
      and t.archived_at is null
  ) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if coalesce(array_length(p_role_ids, 1), 0) > 60 then
    raise exception 'too_many_positions' using errcode = '22023';
  end if;
  -- Someone may only change positions in departments they schedule.
  if exists (
    select 1 from public.service_type_positions p
    where p.service_type_id = p_id and not private.has_capability('schedule.manage', p.department_id)
      and p.role_id <> all (coalesce(p_role_ids, '{}'))
  ) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  delete from public.service_type_positions p where p.service_type_id = p_id;
  foreach v_role_id in array coalesce(p_role_ids, '{}') loop
    select * into v_role from public.serving_roles r where r.id = v_role_id and r.archived_at is null;
    if v_role.id is null then
      raise exception 'role_not_found' using errcode = 'P0001';
    end if;
    v_order := v_order + 10;
    insert into public.service_type_positions (service_type_id, role_id, department_id, sort_order)
    values (p_id, v_role.id, v_role.department_id, v_order);
  end loop;

  insert into public.audit_events (organization_id, actor_id, action, target_table, target_id, metadata)
  values (private.current_organization_id(), (select auth.uid()), 'service_type.positions_set',
          'service_types', p_id, jsonb_build_object('positions', coalesce(array_length(p_role_ids, 1), 0)));
end;
$$;

-- Makes dated services from a service type, with its positions. Skips past dates and dates that
-- already have a service of this type. Returns how many were made.
create function public.create_services(p_service_type_id uuid, p_dates date[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type public.service_types;
  v_date date;
  v_starts timestamptz;
  v_event_id uuid;
  v_made integer := 0;
begin
  select * into v_type from public.service_types t
   where t.id = p_service_type_id and t.organization_id = private.current_organization_id()
     and t.archived_at is null;
  if v_type.id is null or not private.has_capability_anywhere('schedule.manage') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if coalesce(array_length(p_dates, 1), 0) > 53 then
    raise exception 'too_many_dates' using errcode = '22023';
  end if;

  foreach v_date in array coalesce(p_dates, '{}') loop
    v_starts := (v_date + v_type.start_time) at time zone 'America/Winnipeg';
    continue when v_starts <= now();
    continue when exists (
      select 1 from public.events e
      where e.service_type_id = v_type.id and e.cancelled_at is null
        and (e.starts_at at time zone 'America/Winnipeg')::date = v_date
    );
    insert into public.events (title, starts_at, ends_at, location, notes, service_type_id)
    values (v_type.name, v_starts, v_starts + make_interval(mins => v_type.duration_minutes),
            v_type.location, v_type.notes, v_type.id)
    returning id into v_event_id;
    insert into public.event_positions (event_id, department_id, role_id, sort_order)
    select v_event_id, p.department_id, p.role_id, p.sort_order
    from public.service_type_positions p
    join public.serving_roles r on r.id = p.role_id and r.archived_at is null
    where p.service_type_id = v_type.id
    order by p.sort_order;
    v_made := v_made + 1;
  end loop;
  return v_made;
end;
$$;

revoke all on function public.save_service_type(uuid, text, time, integer, text, text) from public, anon;
revoke all on function public.archive_service_type(uuid) from public, anon;
revoke all on function public.set_service_type_positions(uuid, uuid[]) from public, anon;
revoke all on function public.create_services(uuid, date[]) from public, anon;
grant execute on function public.save_service_type(uuid, text, time, integer, text, text) to authenticated;
grant execute on function public.archive_service_type(uuid) to authenticated;
grant execute on function public.set_service_type_positions(uuid, uuid[]) to authenticated;
grant execute on function public.create_services(uuid, date[]) to authenticated;

-- Who is serving at a service: for the people scheduled at it, and its schedulers. Names,
-- positions, and replies only.
create function public.event_team(p_event_id uuid)
returns table (
  position_id uuid,
  role_name text,
  department_name text,
  user_id uuid,
  display_name text,
  status public.assignment_status
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (
    exists (
      select 1 from public.event_assignments a
      where a.event_id = p_event_id and a.user_id = (select auth.uid())
        and a.status in ('pending', 'confirmed')
    )
    or exists (
      select 1 from public.event_positions p
      where p.event_id = p_event_id and private.has_capability('schedule.manage', p.department_id)
    )
  ) or not private.is_active_user() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  return query
    select p.id, r.name, d.name, a.user_id, pr.display_name, a.status
    from public.event_positions p
    join public.serving_roles r on r.id = p.role_id
    join public.departments d on d.id = p.department_id
    left join public.event_assignments a
      on a.position_id = p.id and a.status in ('pending', 'confirmed')
    left join public.profiles pr on pr.id = a.user_id
    where p.event_id = p_event_id
    order by d.sort_order, p.sort_order;
end;
$$;
revoke all on function public.event_team(uuid) from public, anon;
grant execute on function public.event_team(uuid) to authenticated;
