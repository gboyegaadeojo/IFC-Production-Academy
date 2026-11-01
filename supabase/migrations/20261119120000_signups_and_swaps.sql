-- Sign-ups and swaps (decision record 9, stage 3), as in Planning Center Services:
--
-- * Sign-ups: when a scheduler opens sign-ups on a service (or on a service type, for the services
--   made from it), anyone on a position's team can take an open spot themselves. The same checks
--   run as when a scheduler assigns them: not away that day, not already serving that day.
-- * Swaps: someone who can't make it asks for cover. Teammates on that position's team who are
--   free that day are told, and the first to take it is scheduled in their place; the original
--   assignment is cancelled, never deleted. The person who asked and the schedulers are told.

alter type public.notification_kind add value if not exists 'cover_requested';
alter type public.notification_kind add value if not exists 'schedule_update';

alter table public.events add column signups_open boolean not null default false;
alter table public.service_types add column allow_signups boolean not null default false;

-- Opens or closes sign-ups on a service.
create function public.set_event_signups(p_event_id uuid, p_open boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.event_positions p
    where p.event_id = p_event_id and private.has_capability('schedule.manage', p.department_id)
  ) and not private.has_capability('schedule.manage') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  update public.events e set signups_open = p_open
   where e.id = p_event_id and e.organization_id = private.current_organization_id();
end;
$$;

-- Whether services made from a type open sign-ups.
create function public.set_service_type_signups(p_id uuid, p_open boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_capability_anywhere('schedule.manage') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  update public.service_types t set allow_signups = p_open
   where t.id = p_id and t.organization_id = private.current_organization_id();
end;
$$;

-- Services made from a type take its sign-up setting.
create function private.event_signups_from_type()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.service_type_id is not null then
    select t.allow_signups into new.signups_open
    from public.service_types t where t.id = new.service_type_id;
  end if;
  return new;
end;
$$;
create trigger events_signups_from_type before insert on public.events
  for each row execute function private.event_signups_from_type();

-- Free to serve in a position at a service: on its team, not away, not serving that day.
create function private.is_free_for(p_user_id uuid, p_position_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.event_positions p
    where p.id = p_position_id
      and private.is_on_position_team(p_user_id, p.role_id)
      and not private.is_unavailable(p_user_id, p.event_id)
      and not private.is_serving_that_day(p_user_id, p.event_id)
  );
$$;
revoke all on function private.is_free_for(uuid, uuid) from public, anon, authenticated;

-- Readiness for the record, as assign_to_position works it out.
create function private.readiness_for(p_user_id uuid, p_role_id uuid)
returns public.assignment_readiness
language plpgsql
security definer
set search_path = ''
as $$
begin
  return case when private.is_approved_for_role(p_user_id, p_role_id)
              then 'approved'::public.assignment_readiness
              else 'learning'::public.assignment_readiness end;
end;
$$;
revoke all on function private.readiness_for(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Sign-ups
-- ---------------------------------------------------------------------------

-- Open spots this person could take: future services with sign-ups open, unfilled positions on
-- teams they're on, on days they're free.
create function public.my_open_spots()
returns table (
  position_id uuid,
  event_id uuid,
  title text,
  starts_at timestamptz,
  ends_at timestamptz,
  location text,
  role_name text,
  department_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_active_user() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  return query
    select p.id, e.id, e.title, e.starts_at, e.ends_at, e.location, r.name, d.name
    from public.events e
    join public.event_positions p on p.event_id = e.id
    join public.serving_roles r on r.id = p.role_id
    join public.departments d on d.id = p.department_id
    where e.organization_id = private.current_organization_id()
      and e.signups_open and e.cancelled_at is null and e.starts_at > now()
      and not exists (
        select 1 from public.event_assignments a
        where a.position_id = p.id and a.status in ('pending', 'confirmed')
      )
      and private.is_free_for((select auth.uid()), p.id)
    order by e.starts_at, d.sort_order, p.sort_order
    limit 50;
end;
$$;

create function public.sign_up_for_position(p_position_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_position public.event_positions;
  v_event public.events;
begin
  if not private.is_active_user() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  select * into v_position from public.event_positions p where p.id = p_position_id for update;
  select * into v_event from public.events e where e.id = v_position.event_id;
  if v_position.id is null or v_event.organization_id <> private.current_organization_id() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if not v_event.signups_open or v_event.cancelled_at is not null or v_event.starts_at <= now() then
    raise exception 'signups_closed' using errcode = 'P0001';
  end if;
  if not private.is_on_position_team(v_user, v_position.role_id) then
    raise exception 'not_on_team' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.event_assignments a
    where a.position_id = p_position_id and a.status in ('pending', 'confirmed')
  ) then
    raise exception 'position_filled' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user::text || 'schedule', 0));
  if private.is_unavailable(v_user, v_event.id) then
    raise exception 'volunteer_unavailable' using errcode = 'P0001';
  end if;
  if private.is_serving_that_day(v_user, v_event.id) then
    raise exception 'schedule_conflict' using errcode = 'P0001';
  end if;
  insert into public.event_assignments
    (position_id, event_id, department_id, role_id, user_id, status, readiness, assigned_by,
     responded_at)
  values (p_position_id, v_event.id, v_position.department_id, v_position.role_id, v_user,
          'confirmed', private.readiness_for(v_user, v_position.role_id), v_user, now());
end;
$$;

-- ---------------------------------------------------------------------------
-- Swaps
-- ---------------------------------------------------------------------------

create type public.cover_request_status as enum ('open', 'covered', 'withdrawn');

create table public.cover_requests (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.event_assignments (id) on delete restrict,
  event_id uuid not null references public.events (id) on delete restrict,
  position_id uuid not null references public.event_positions (id) on delete restrict,
  department_id uuid not null references public.departments (id) on delete restrict,
  requested_by uuid not null references public.profiles (id),
  note text not null default '' check (length(note) <= 300),
  status public.cover_request_status not null default 'open',
  covered_by uuid references public.profiles (id),
  replacement_id uuid references public.event_assignments (id),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index cover_requests_one_open_idx on public.cover_requests (assignment_id)
  where status = 'open';
create index cover_requests_event_idx on public.cover_requests (event_id);

alter table public.cover_requests enable row level security;
create policy "People read their own cover requests; schedulers read their department's"
  on public.cover_requests for select to authenticated
  using (
    (requested_by = (select auth.uid()) and private.is_active_user())
    or covered_by = (select auth.uid())
    or private.has_capability('schedule.manage', department_id)
  );
grant select on public.cover_requests to authenticated;

create trigger cover_requests_set_updated_at before update on public.cover_requests
  for each row execute function private.set_updated_at();
create trigger cover_requests_audit after insert or update on public.cover_requests
  for each row execute function private.audit_change('cover_request');

-- Everyone who schedules a department: its own schedulers and organisation-wide ones, such as
-- the Scheduling Administrator.
create function private.notify_schedulers(
  p_department_id uuid, p_title text, p_body text, p_link text, p_dedupe text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  for v_user in
    select distinct ur.user_id
    from public.user_roles ur
    join public.role_capabilities rc on rc.role_id = ur.role_id
    join public.capabilities c on c.id = rc.capability_id and c.key = 'schedule.manage'
    join public.profiles p on p.id = ur.user_id and p.status = 'active'
    where ur.revoked_at is null
      and (ur.department_id = p_department_id or ur.department_id is null)
  loop
    continue when v_user = (select auth.uid());
    perform private.notify(v_user, 'schedule_update', p_title, p_body, p_link,
                           p_dedupe || ':' || v_user);
  end loop;
end;
$$;
revoke all on function private.notify_schedulers(uuid, text, text, text, text)
  from public, anon, authenticated;

create function public.request_cover(p_assignment_id uuid, p_note text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_assignment public.event_assignments;
  v_event public.events;
  v_role text;
  v_name text;
  v_id uuid;
  v_teammate uuid;
begin
  select * into v_assignment from public.event_assignments a where a.id = p_assignment_id for update;
  if v_assignment.id is null or v_assignment.user_id <> v_user or not private.is_active_user() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  select * into v_event from public.events e where e.id = v_assignment.event_id;
  if v_assignment.status not in ('pending', 'confirmed') or v_event.cancelled_at is not null
     or v_event.starts_at <= now() then
    raise exception 'assignment_closed' using errcode = 'P0001';
  end if;
  if length(coalesce(p_note, '')) > 300 then
    raise exception 'invalid_note' using errcode = '22023';
  end if;
  insert into public.cover_requests
    (assignment_id, event_id, position_id, department_id, requested_by, note)
  values (v_assignment.id, v_event.id, v_assignment.position_id, v_assignment.department_id,
          v_user, trim(coalesce(p_note, '')))
  on conflict (assignment_id) where status = 'open' do nothing
  returning id into v_id;
  if v_id is null then
    select r.id into v_id from public.cover_requests r
     where r.assignment_id = v_assignment.id and r.status = 'open';
    return v_id;
  end if;

  select r.name into v_role from public.serving_roles r where r.id = v_assignment.role_id;
  select p.display_name into v_name from public.profiles p where p.id = v_user;
  for v_teammate in
    select t.user_id from public.serving_team_members t
    where t.role_id = v_assignment.role_id and t.removed_at is null and t.user_id <> v_user
      and private.is_free_for(t.user_id, v_assignment.position_id)
  loop
    perform private.notify(v_teammate, 'cover_requested',
      'Can you cover ' || coalesce(v_role, 'a position') || '?',
      coalesce(v_name, 'A teammate') || ' can''t make ' || v_event.title || ', '
        || private.winnipeg_when(v_event.starts_at) || '. Take the spot if you''re free.',
      '/schedule', 'cover:' || v_id || ':' || v_teammate);
  end loop;
  perform private.notify_schedulers(v_assignment.department_id,
    coalesce(v_name, 'Someone') || ' asked for cover',
    coalesce(v_role, 'A position') || ' at ' || v_event.title || ', '
      || private.winnipeg_when(v_event.starts_at) || '. Their teammates have been asked.',
    '/admin/schedule/' || v_event.id, 'cover-asked:' || v_id);
  return v_id;
end;
$$;

create function public.withdraw_cover_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.cover_requests r set status = 'withdrawn', closed_at = now()
   where r.id = p_request_id and r.requested_by = (select auth.uid()) and r.status = 'open';
  if not found then
    raise exception 'request_closed' using errcode = 'P0001';
  end if;
end;
$$;

-- Open requests this person could take: on the position's team and free that day.
create function public.cover_requests_for_me()
returns table (
  request_id uuid,
  event_id uuid,
  title text,
  starts_at timestamptz,
  ends_at timestamptz,
  role_name text,
  department_name text,
  requested_by_name text,
  note text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_active_user() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  return query
    select r.id, e.id, e.title, e.starts_at, e.ends_at, ro.name, d.name, pr.display_name, r.note
    from public.cover_requests r
    join public.events e on e.id = r.event_id
    join public.event_positions p on p.id = r.position_id
    join public.serving_roles ro on ro.id = p.role_id
    join public.departments d on d.id = r.department_id
    join public.profiles pr on pr.id = r.requested_by
    where r.status = 'open' and e.cancelled_at is null and e.starts_at > now()
      and r.requested_by <> (select auth.uid())
      and private.is_free_for((select auth.uid()), r.position_id)
    order by e.starts_at
    limit 50;
end;
$$;

-- Takes a cover request: the taker is scheduled (confirmed) and the original is cancelled.
create function public.take_cover(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_request public.cover_requests;
  v_assignment public.event_assignments;
  v_event public.events;
  v_new uuid;
  v_name text;
  v_role text;
begin
  if not private.is_active_user() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  select * into v_request from public.cover_requests r where r.id = p_request_id for update;
  if v_request.id is null or v_request.status <> 'open' then
    raise exception 'request_closed' using errcode = 'P0001';
  end if;
  if v_request.requested_by = v_user then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  select * into v_assignment from public.event_assignments a where a.id = v_request.assignment_id for update;
  select * into v_event from public.events e where e.id = v_request.event_id;
  if v_assignment.status not in ('pending', 'confirmed') or v_event.cancelled_at is not null
     or v_event.starts_at <= now() then
    raise exception 'request_closed' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user::text || 'schedule', 0));
  if not private.is_on_position_team(v_user, v_assignment.role_id) then
    raise exception 'not_on_team' using errcode = 'P0001';
  end if;
  if private.is_unavailable(v_user, v_event.id) then
    raise exception 'volunteer_unavailable' using errcode = 'P0001';
  end if;
  if private.is_serving_that_day(v_user, v_event.id) then
    raise exception 'schedule_conflict' using errcode = 'P0001';
  end if;

  update public.event_assignments a set status = 'cancelled', cancelled_at = now()
   where a.id = v_assignment.id;
  insert into public.event_assignments
    (position_id, event_id, department_id, role_id, user_id, status, readiness, assigned_by,
     responded_at)
  values (v_assignment.position_id, v_event.id, v_assignment.department_id, v_assignment.role_id,
          v_user, 'confirmed', private.readiness_for(v_user, v_assignment.role_id), v_user, now())
  returning id into v_new;
  update public.cover_requests r
     set status = 'covered', covered_by = v_user, replacement_id = v_new, closed_at = now()
   where r.id = v_request.id;

  select p.display_name into v_name from public.profiles p where p.id = v_user;
  select r.name into v_role from public.serving_roles r where r.id = v_assignment.role_id;
  perform private.notify(v_request.requested_by, 'schedule_update',
    coalesce(v_name, 'A teammate') || ' is covering for you',
    coalesce(v_role, 'Your position') || ' at ' || v_event.title || ', '
      || private.winnipeg_when(v_event.starts_at) || '. You''re no longer scheduled for it.',
    '/schedule', 'covered:' || v_request.id);
  perform private.notify_schedulers(v_assignment.department_id,
    coalesce(v_name, 'Someone') || ' is covering ' || coalesce(v_role, 'a position'),
    v_event.title || ', ' || private.winnipeg_when(v_event.starts_at) || '.',
    '/admin/schedule/' || v_event.id, 'covered-schedulers:' || v_request.id);
end;
$$;

-- A volunteer who signs up or takes cover has chosen it, so the "please confirm" note is skipped.
create or replace function private.notify_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events;
  v_role text;
begin
  if new.assigned_by = new.user_id then
    return null;
  end if;
  select * into v_event from public.events e where e.id = new.event_id;
  select r.name into v_role from public.serving_roles r where r.id = new.role_id;
  perform private.notify(new.user_id, 'assignment_scheduled',
    'You''re scheduled: ' || coalesce(v_role, 'a serving role'),
    v_event.title || ', ' ||
      to_char(v_event.starts_at at time zone 'America/Winnipeg', 'Dy Mon FMDD, FMHH12:MI AM') ||
      '. Please confirm or decline.',
    '/schedule',
    'assignment:' || new.id);
  return null;
end;
$$;

revoke all on function public.set_event_signups(uuid, boolean) from public, anon;
revoke all on function public.set_service_type_signups(uuid, boolean) from public, anon;
revoke all on function public.my_open_spots() from public, anon;
revoke all on function public.sign_up_for_position(uuid) from public, anon;
revoke all on function public.request_cover(uuid, text) from public, anon;
revoke all on function public.withdraw_cover_request(uuid) from public, anon;
revoke all on function public.cover_requests_for_me() from public, anon;
revoke all on function public.take_cover(uuid) from public, anon;
grant execute on function public.set_event_signups(uuid, boolean) to authenticated;
grant execute on function public.set_service_type_signups(uuid, boolean) to authenticated;
grant execute on function public.my_open_spots() to authenticated;
grant execute on function public.sign_up_for_position(uuid) to authenticated;
grant execute on function public.request_cover(uuid, text) to authenticated;
grant execute on function public.withdraw_cover_request(uuid) to authenticated;
grant execute on function public.cover_requests_for_me() to authenticated;
grant execute on function public.take_cover(uuid) to authenticated;

-- Suggested people for a position (stage 1's grid): free first, then trained, then whoever has
-- served least recently, so the load is shared.
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
             private.is_unavailable(pr.id, v_position.event_id) as unavailable,
             (select max(e.starts_at)
                from public.event_assignments a
                join public.events e on e.id = a.event_id
               where a.user_id = pr.id and a.department_id = v_position.department_id
                 and a.status in ('pending', 'confirmed') and e.cancelled_at is null
                 and e.starts_at < now()) as last_served
      from public.serving_team_members t
      join public.department_memberships m
        on m.user_id = t.user_id and m.department_id = t.department_id and m.status = 'active'
      join public.profiles pr on pr.id = t.user_id and pr.status = 'active'
      where t.role_id = v_position.role_id and t.removed_at is null
    ) c
    order by (c.conflict or c.unavailable), not c.approved, c.last_served asc nulls first,
             c.display_name;
end;
$$;
