-- Planning Center is the scheduler (G, 2026-10-31; decision record 9, revised). The Academy reads
-- the schedule from Planning Center Services instead of keeping its own, as IFC's Sunday
-- Pre-Service Checklist app does. The Academy's own scheduler stays in the code, switched off by
-- organizations.scheduling_source, as a future option.
--
-- * A scheduled job (GitHub Actions, scripts/sync-planning-center.ts) reads Planning Center with
--   the church's read-only Personal Access Token and calls sync_planning_center() with the
--   service role. Nothing else writes these rows while Planning Center is the scheduler.
-- * People are matched by email: their Academy sign-in email is one of their Planning Center
--   emails. Only the match is kept; Planning Center emails aren't stored.
-- * Planning Center positions are linked to Academy positions (serving roles) on the Planning
--   Center page, like the checklist app's Team mapping: a position's own link, else its team's.
-- * Synced services, assignments, position teams, and blockouts reuse the Academy's tables, so the
--   calendars, "who's serving with you", and the service-day checklists work unchanged.
-- * Planning Center sends its own scheduling emails and reminders, so the Academy doesn't.

-- ---------------------------------------------------------------------------
-- Which scheduler
-- ---------------------------------------------------------------------------

alter table public.organizations add column scheduling_source text not null default 'academy'
  check (scheduling_source in ('academy', 'planning_center'));
update public.organizations set scheduling_source = 'planning_center';

create function public.scheduling_source()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select o.scheduling_source from public.organizations o
  where o.id = private.current_organization_id();
$$;
revoke all on function public.scheduling_source() from public, anon;
grant execute on function public.scheduling_source() to authenticated;

create function public.set_scheduling_source(p_source text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_capability('schedule.manage') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_source not in ('academy', 'planning_center') then
    raise exception 'invalid_source' using errcode = '22023';
  end if;
  update public.organizations o set scheduling_source = p_source
   where o.id = private.current_organization_id();
end;
$$;
revoke all on function public.set_scheduling_source(text) from public, anon;
grant execute on function public.set_scheduling_source(text) to authenticated;

-- While Planning Center schedules, only the sync (service role) changes the schedule. Direct
-- database work without a signed-in user (migrations, maintenance) isn't affected.
create function private.guard_planning_center_writes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := coalesce((select auth.role()), '');
begin
  if v_role in ('', 'service_role') or exists (
    select 1 from public.organizations o
    where o.id = private.current_organization_id() and o.scheduling_source = 'academy'
  ) then
    return coalesce(new, old);
  end if;
  raise exception 'managed_in_planning_center' using errcode = 'P0001';
end;
$$;

create trigger events_planning_center_guard before insert or update on public.events
  for each row execute function private.guard_planning_center_writes();
create trigger event_positions_planning_center_guard before insert or update or delete on public.event_positions
  for each row execute function private.guard_planning_center_writes();
create trigger event_assignments_planning_center_guard before insert or update on public.event_assignments
  for each row execute function private.guard_planning_center_writes();
create trigger unavailability_planning_center_guard before insert or update or delete on public.unavailability
  for each row execute function private.guard_planning_center_writes();
create trigger serving_team_members_planning_center_guard before insert or update on public.serving_team_members
  for each row execute function private.guard_planning_center_writes();
create trigger cover_requests_planning_center_guard before insert on public.cover_requests
  for each row execute function private.guard_planning_center_writes();

-- ---------------------------------------------------------------------------
-- Where rows came from
-- ---------------------------------------------------------------------------

alter table public.events
  add column source text not null default 'academy' check (source in ('academy', 'planning_center')),
  add column external_id text;
create unique index events_external_idx on public.events (organization_id, source, external_id)
  where external_id is not null;

alter table public.event_positions add column external_id text;
create unique index event_positions_external_idx on public.event_positions (external_id)
  where external_id is not null;

alter table public.event_assignments alter column assigned_by drop not null;
alter table public.event_assignments add column external_id text;
create unique index event_assignments_external_idx on public.event_assignments (external_id)
  where external_id is not null;

alter table public.unavailability
  add column source text not null default 'academy' check (source in ('academy', 'planning_center')),
  add column external_id text;

alter table public.serving_team_members
  add column source text not null default 'academy' check (source in ('academy', 'planning_center'));

-- Synced assignments were made in Planning Center, which has already told the person.
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
  if new.assigned_by is null or new.assigned_by = new.user_id then
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

-- ---------------------------------------------------------------------------
-- Planning Center's teams, positions, and people, as last read
-- ---------------------------------------------------------------------------

create table public.pco_service_types (
  id text primary key,
  organization_id uuid not null references public.organizations (id),
  name text not null,
  seen_at timestamptz not null default now()
);
create table public.pco_teams (
  id text primary key,
  organization_id uuid not null references public.organizations (id),
  service_type_id text not null,
  name text not null,
  seen_at timestamptz not null default now()
);
create table public.pco_positions (
  id text primary key,
  organization_id uuid not null references public.organizations (id),
  team_id text not null,
  name text not null,
  seen_at timestamptz not null default now()
);
-- Names only, and who they matched in the Academy. Emails aren't kept.
create table public.pco_people (
  id text primary key,
  organization_id uuid not null references public.organizations (id),
  display_name text not null,
  user_id uuid references public.profiles (id),
  seen_at timestamptz not null default now()
);
create index pco_people_user_idx on public.pco_people (user_id);

-- A Planning Center position (or, with no position, a whole team) linked to an Academy position.
create table public.pco_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  pco_team_id text not null,
  pco_position_id text,
  role_id uuid not null references public.serving_roles (id),
  created_by uuid default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now()
);
create unique index pco_links_target_idx on public.pco_links (pco_team_id, coalesce(pco_position_id, ''));

create table public.pco_sync_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  finished_at timestamptz not null default now(),
  counts jsonb not null
);
create index pco_sync_runs_finished_idx on public.pco_sync_runs (finished_at desc);

alter table public.pco_service_types enable row level security;
alter table public.pco_teams enable row level security;
alter table public.pco_positions enable row level security;
alter table public.pco_people enable row level security;
alter table public.pco_links enable row level security;
alter table public.pco_sync_runs enable row level security;

create function private.manages_planning_center()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_capability_anywhere('team.manage')
      or private.has_capability_anywhere('schedule.manage');
$$;
revoke all on function private.manages_planning_center() from public, anon;
grant execute on function private.manages_planning_center() to authenticated;

create policy "Team managers read Planning Center service types" on public.pco_service_types
  for select to authenticated using (private.manages_planning_center());
create policy "Team managers read Planning Center teams" on public.pco_teams
  for select to authenticated using (private.manages_planning_center());
create policy "Team managers read Planning Center positions" on public.pco_positions
  for select to authenticated using (private.manages_planning_center());
create policy "Team managers read Planning Center people" on public.pco_people
  for select to authenticated using (private.manages_planning_center());
create policy "Team managers read position links" on public.pco_links
  for select to authenticated using (private.manages_planning_center());
create policy "Team managers read sync runs" on public.pco_sync_runs
  for select to authenticated using (private.manages_planning_center());
grant select on public.pco_service_types, public.pco_teams, public.pco_positions,
  public.pco_people, public.pco_links, public.pco_sync_runs to authenticated;

create trigger pco_links_audit after insert or update or delete on public.pco_links
  for each row execute function private.audit_change('pco_link');

-- Links a Planning Center position (or a whole team, with no position) to an Academy position, or
-- removes the link when p_role_id is null. Takes effect at the next sync.
create function public.set_pco_link(p_team_id text, p_position_id text, p_role_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_department_id uuid;
begin
  if not private.has_capability_anywhere('team.manage') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if not exists (select 1 from public.pco_teams t where t.id = p_team_id)
     or (p_position_id is not null and not exists (
       select 1 from public.pco_positions p where p.id = p_position_id and p.team_id = p_team_id)) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if p_role_id is not null then
    select r.department_id into v_department_id from public.serving_roles r
     where r.id = p_role_id and r.archived_at is null;
    if v_department_id is null or not private.has_capability('team.manage', v_department_id) then
      raise exception 'not_authorized' using errcode = '42501';
    end if;
  end if;
  delete from public.pco_links l
   where l.pco_team_id = p_team_id and coalesce(l.pco_position_id, '') = coalesce(p_position_id, '');
  if p_role_id is not null then
    insert into public.pco_links (organization_id, pco_team_id, pco_position_id, role_id)
    values (private.current_organization_id(), p_team_id, p_position_id, p_role_id);
  end if;
end;
$$;
revoke all on function public.set_pco_link(text, text, uuid) from public, anon;
grant execute on function public.set_pco_link(text, text, uuid) to authenticated;

-- The Academy position for a Planning Center team and position: the position's own link, else
-- the whole team's.
create function private.pco_role(p_team_id text, p_position_id text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select l.role_id from public.pco_links l
      where l.pco_team_id = p_team_id and l.pco_position_id = p_position_id),
    (select l.role_id from public.pco_links l
      where l.pco_team_id = p_team_id and l.pco_position_id is null)
  );
$$;
revoke all on function private.pco_role(text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The sync
-- ---------------------------------------------------------------------------

-- Applies one read of Planning Center. The payload (built by scripts/sync-planning-center.ts):
--   service_types [{id, name}], teams [{id, service_type_id, name, positions [{id, name}]}],
--   people [{id, name, emails []}], roster [{person_id, team_id, position_id}],
--   plans [{id, title, starts_at, ends_at, members [{id, person_id, team_id, position_id, status}]}],
--   blockouts [{id, person_id, starts_on, ends_on, reason}], from, to.
-- Returns counts only.
create function public.sync_planning_center(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := (select o.id from public.organizations o order by o.created_at limit 1);
  v_plan jsonb;
  v_member jsonb;
  v_event uuid;
  v_position uuid;
  v_role public.serving_roles;
  v_role_id uuid;
  v_user uuid;
  v_status public.assignment_status;
  v_kept text[];
  v_plans text[] := '{}';
  v_roster record;
  v_counts jsonb;
  v_scheduled integer := 0;
  v_unlinked integer := 0;
  v_unmatched integer := 0;
begin
  if (p ->> 'from') is null or (p ->> 'to') is null then
    raise exception 'invalid_payload' using errcode = '22023';
  end if;

  -- What Planning Center has.
  insert into public.pco_service_types (id, organization_id, name, seen_at)
  select x ->> 'id', v_org, coalesce(x ->> 'name', ''), now()
  from jsonb_array_elements(coalesce(p -> 'service_types', '[]')) x
  on conflict (id) do update set name = excluded.name, seen_at = excluded.seen_at;

  insert into public.pco_teams (id, organization_id, service_type_id, name, seen_at)
  select x ->> 'id', v_org, x ->> 'service_type_id', coalesce(x ->> 'name', ''), now()
  from jsonb_array_elements(coalesce(p -> 'teams', '[]')) x
  on conflict (id) do update
    set service_type_id = excluded.service_type_id, name = excluded.name, seen_at = excluded.seen_at;

  insert into public.pco_positions (id, organization_id, team_id, name, seen_at)
  select y ->> 'id', v_org, x ->> 'id', coalesce(y ->> 'name', ''), now()
  from jsonb_array_elements(coalesce(p -> 'teams', '[]')) x,
       jsonb_array_elements(coalesce(x -> 'positions', '[]')) y
  on conflict (id) do update set team_id = excluded.team_id, name = excluded.name, seen_at = excluded.seen_at;

  -- Who they are in the Academy: an active account whose sign-in email is one of theirs.
  insert into public.pco_people (id, organization_id, display_name, user_id, seen_at)
  select x ->> 'id', v_org, coalesce(x ->> 'name', ''),
         (select u.id from auth.users u
            join public.profiles pr on pr.id = u.id and pr.status = 'active'
           where lower(u.email) in (select lower(trim(e)) from jsonb_array_elements_text(coalesce(x -> 'emails', '[]')) e)
           order by u.created_at limit 1),
         now()
  from jsonb_array_elements(coalesce(p -> 'people', '[]')) x
  on conflict (id) do update
    set display_name = excluded.display_name, user_id = excluded.user_id, seen_at = excluded.seen_at;

  -- Position teams: the roster, through the links.
  drop table if exists pg_temp.pco_roster;
  create temporary table pco_roster on commit drop as
  select distinct pp.user_id, private.pco_role(x ->> 'team_id', x ->> 'position_id') as role_id
  from jsonb_array_elements(coalesce(p -> 'roster', '[]')) x
  join public.pco_people pp on pp.id = x ->> 'person_id'
  where pp.user_id is not null;
  delete from pg_temp.pco_roster where role_id is null;

  for v_roster in select * from pg_temp.pco_roster loop
    select * into v_role from public.serving_roles r where r.id = v_roster.role_id;
    if not exists (
      select 1 from public.department_memberships m
      where m.user_id = v_roster.user_id and m.department_id = v_role.department_id and m.status = 'active'
    ) then
      update public.department_memberships m
         set status = 'active', decided_at = now(), decision_reason = 'On the Planning Center team'
       where m.user_id = v_roster.user_id and m.department_id = v_role.department_id
         and m.status = 'requested';
      if not found then
        insert into public.department_memberships (department_id, user_id, status, decided_at, decision_reason)
        values (v_role.department_id, v_roster.user_id, 'active', now(), 'On the Planning Center team');
      end if;
    end if;
    insert into public.serving_team_members (role_id, department_id, user_id, source)
    values (v_role.id, v_role.department_id, v_roster.user_id, 'planning_center')
    on conflict (role_id, user_id) where removed_at is null do nothing;
  end loop;
  update public.serving_team_members t set removed_at = now()
   where t.source = 'planning_center' and t.removed_at is null
     and not exists (select 1 from pg_temp.pco_roster r where r.user_id = t.user_id and r.role_id = t.role_id);

  -- Services and who's scheduled.
  for v_plan in select * from jsonb_array_elements(coalesce(p -> 'plans', '[]')) loop
    v_plans := v_plans || (v_plan ->> 'id');
    insert into public.events (organization_id, title, starts_at, ends_at, location, source, external_id)
    values (v_org, left(coalesce(nullif(trim(v_plan ->> 'title'), ''), 'Service'), 120),
            (v_plan ->> 'starts_at')::timestamptz, (v_plan ->> 'ends_at')::timestamptz, '',
            'planning_center', v_plan ->> 'id')
    on conflict (organization_id, source, external_id) where external_id is not null do update
      set title = excluded.title, starts_at = excluded.starts_at, ends_at = excluded.ends_at,
          cancelled_at = null
      where (public.events.title, public.events.starts_at, public.events.ends_at)
              is distinct from (excluded.title, excluded.starts_at, excluded.ends_at)
         or public.events.cancelled_at is not null;
    select e.id into v_event from public.events e
     where e.organization_id = v_org and e.source = 'planning_center' and e.external_id = v_plan ->> 'id';

    v_kept := '{}';
    for v_member in select * from jsonb_array_elements(coalesce(v_plan -> 'members', '[]')) loop
      v_role_id := private.pco_role(v_member ->> 'team_id', v_member ->> 'position_id');
      select pp.user_id into v_user from public.pco_people pp where pp.id = v_member ->> 'person_id';
      if v_role_id is null then
        v_unlinked := v_unlinked + 1;
        continue;
      end if;
      if v_user is null then
        v_unmatched := v_unmatched + 1;
        continue;
      end if;
      select * into v_role from public.serving_roles r where r.id = v_role_id;
      v_status := case v_member ->> 'status'
                    when 'C' then 'confirmed'::public.assignment_status
                    when 'D' then 'declined'::public.assignment_status
                    else 'pending'::public.assignment_status end;

      insert into public.event_positions (event_id, department_id, role_id, sort_order, external_id)
      values (v_event, v_role.department_id, v_role.id, 0, v_member ->> 'id')
      on conflict (external_id) where external_id is not null do update
        set event_id = excluded.event_id, department_id = excluded.department_id, role_id = excluded.role_id
        where (public.event_positions.event_id, public.event_positions.role_id)
                is distinct from (excluded.event_id, excluded.role_id);
      select ep.id into v_position from public.event_positions ep where ep.external_id = v_member ->> 'id';

      insert into public.event_assignments
        (position_id, event_id, department_id, role_id, user_id, status, readiness, assigned_by,
         external_id, responded_at)
      values (v_position, v_event, v_role.department_id, v_role.id, v_user, v_status,
              private.readiness_for(v_user, v_role.id), null, v_member ->> 'id',
              case when v_status <> 'pending' then now() end)
      on conflict (external_id) where external_id is not null do update
        set status = excluded.status, department_id = excluded.department_id,
            role_id = excluded.role_id, user_id = excluded.user_id, cancelled_at = null,
            responded_at = coalesce(public.event_assignments.responded_at, excluded.responded_at)
        where (public.event_assignments.status, public.event_assignments.role_id, public.event_assignments.user_id)
                is distinct from (excluded.status, excluded.role_id, excluded.user_id);
      v_kept := v_kept || (v_member ->> 'id');
      v_scheduled := v_scheduled + 1;
    end loop;

    -- Taken off the plan, or no longer linked: cancelled, never deleted.
    update public.event_assignments a set status = 'cancelled', cancelled_at = now()
     where a.event_id = v_event and a.external_id is not null
       and a.status in ('pending', 'confirmed', 'declined')
       and not (a.external_id = any (v_kept));
  end loop;

  -- Plans no longer in Planning Center, within the window read.
  update public.events e set cancelled_at = now()
   where e.organization_id = v_org and e.source = 'planning_center' and e.cancelled_at is null
     and e.starts_at >= (p ->> 'from')::timestamptz and e.starts_at < (p ->> 'to')::timestamptz
     and not (e.external_id = any (v_plans));

  -- Blockouts: replaced each time.
  delete from public.unavailability u where u.source = 'planning_center';
  insert into public.unavailability (user_id, starts_on, ends_on, note, source, external_id)
  select pp.user_id, b.starts_on, least(greatest(b.ends_on, b.starts_on), b.starts_on + 366),
         left(coalesce(b.reason, ''), 200), 'planning_center', b.id
  from (
    select x ->> 'id' as id, x ->> 'person_id' as person_id, (x ->> 'starts_on')::date as starts_on,
           (x ->> 'ends_on')::date as ends_on, x ->> 'reason' as reason
    from jsonb_array_elements(coalesce(p -> 'blockouts', '[]')) x
  ) b
  join public.pco_people pp on pp.id = b.person_id and pp.user_id is not null;

  v_counts := jsonb_build_object(
    'service_types', jsonb_array_length(coalesce(p -> 'service_types', '[]')),
    'teams', jsonb_array_length(coalesce(p -> 'teams', '[]')),
    'people', jsonb_array_length(coalesce(p -> 'people', '[]')),
    'people_matched', (select count(*) from public.pco_people pp where pp.user_id is not null),
    'roster', jsonb_array_length(coalesce(p -> 'roster', '[]')),
    'team_places', (select count(*) from pg_temp.pco_roster),
    'plans', coalesce(array_length(v_plans, 1), 0),
    'scheduled', v_scheduled,
    'unlinked_positions', v_unlinked,
    'without_academy_account', v_unmatched,
    'blockouts', jsonb_array_length(coalesce(p -> 'blockouts', '[]'))
  );
  insert into public.pco_sync_runs (organization_id, counts) values (v_org, v_counts);
  return v_counts;
end;
$$;
revoke all on function public.sync_planning_center(jsonb) from public, anon, authenticated;
grant execute on function public.sync_planning_center(jsonb) to service_role;

-- Planning Center sends its own "please confirm" and reminder emails for the services it
-- schedules, so the Academy's reminders cover only services it scheduled itself. Otherwise as in
-- 20261114120000_reminders.sql.
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
