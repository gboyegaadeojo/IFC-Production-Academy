-- Checklist settings, as in IFC's Sunday Pre-Service Checklist app (its US-05, US-07, US-11a,
-- US-15, Q3, Q4):
--
-- * Which Planning Center service type the checklist follows (such as "479 Sunday Service"):
--   the current service is that type's earliest plan today or later. With none chosen, any
--   service counts, as before.
-- * The service day, seeded Sunday: when nothing is published, the checklist still opens for the
--   next service day, so the team can tick, with a note saying so. When Planning Center
--   publishes a plan for that day, the sync gives the plan that service, so nothing ticked is
--   lost.
-- * The time zone stays America/Winnipeg: CLAUDE.md fixes it for the whole Academy.
--
-- Church-wide checklist managers (the app's Admins) change them. Changes are audited, and logged
-- with the checklist edits.

alter table public.organizations
  add column checklist_service_type_id text,
  add column service_weekday smallint not null default 0 check (service_weekday between 0 and 6);

comment on column public.organizations.checklist_service_type_id is
  'The Planning Center service type the checklist follows; null for every service.';
comment on column public.organizations.service_weekday is
  'The usual service day (0 = Sunday), used when nothing is published.';

alter table public.events
  add column pco_service_type_id text,
  add column is_placeholder boolean not null default false;
create index events_pco_service_type_idx
  on public.events (organization_id, pco_service_type_id, starts_at);

comment on column public.events.is_placeholder is
  'Opened by the checklist for the service day before Planning Center published a plan.';

-- Whether a service of this Planning Center type is one the checklist follows. Services from
-- elsewhere (no type) always are.
create function private.follows_checklist_service_type(p_org uuid, p_service_type_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select o.checklist_service_type_id is null or p_service_type_id is null
        or p_service_type_id = o.checklist_service_type_id
    from public.organizations o where o.id = p_org
  ), true);
$$;
revoke all on function private.follows_checklist_service_type(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The current service follows the chosen service type
-- ---------------------------------------------------------------------------

create or replace function public.current_service()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select e.id
  from public.events e
  where e.organization_id = private.current_organization_id()
    and e.cancelled_at is null
    and (e.starts_at at time zone 'America/Winnipeg')::date
        >= (now() at time zone 'America/Winnipeg')::date
    and private.is_active_user()
    and private.follows_checklist_service_type(e.organization_id, e.pco_service_type_id)
  order by
    (e.starts_at at time zone 'America/Winnipeg')::date,
    -- A service I'm scheduled at that day comes before others on the same day, and a published
    -- service before one the checklist opened.
    not exists (
      select 1 from public.event_assignments a
      where a.event_id = e.id and a.user_id = (select auth.uid())
        and a.status in ('pending', 'confirmed')
    ),
    e.is_placeholder,
    e.starts_at
  limit 1;
$$;

create or replace function private.church_current_service()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select e.id from public.events e
  where e.organization_id = private.church_id() and e.cancelled_at is null
    and (e.starts_at at time zone 'America/Winnipeg')::date >= (now() at time zone 'America/Winnipeg')::date
    and private.follows_checklist_service_type(e.organization_id, e.pco_service_type_id)
  order by (e.starts_at at time zone 'America/Winnipeg')::date, e.is_placeholder, e.starts_at
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Opening the checklist when nothing is published
-- ---------------------------------------------------------------------------

-- Only the checklist opens a service on its own; the sync still writes everything else.
create or replace function private.guard_planning_center_writes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := coalesce((select auth.role()), '');
begin
  if v_role in ('', 'service_role')
     or (tg_table_name = 'events' and current_setting('academy.placeholder_service', true) = 'on')
     or exists (
       select 1 from public.organizations o
       where o.id = private.current_organization_id() and o.scheduling_source = 'academy'
     ) then
    return coalesce(new, old);
  end if;
  raise exception 'managed_in_planning_center' using errcode = 'P0001';
end;
$$;

-- The service the checklist opens to: the current service, or, when none is published, the next
-- service day (today, if today is that day). Returns null for people the checklist isn't for.
create function public.open_current_service()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event uuid;
  v_org uuid := private.current_organization_id();
  v_today date := (now() at time zone 'America/Winnipeg')::date;
  v_day date;
  v_weekday integer;
  v_starts timestamptz;
begin
  if not private.is_active_user() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  v_event := public.current_service();
  if v_event is not null then
    return v_event;
  end if;
  if not (private.is_team_member() or private.has_capability_anywhere('checklist.manage')) then
    return null;
  end if;
  select o.service_weekday into v_weekday from public.organizations o where o.id = v_org;
  v_day := v_today + ((coalesce(v_weekday, 0) - extract(dow from v_today)::integer + 7) % 7);
  perform pg_advisory_xact_lock(hashtextextended('checklist-placeholder:' || v_day::text, 0));
  select e.id into v_event from public.events e
   where e.organization_id = v_org and e.is_placeholder and e.cancelled_at is null
     and (e.starts_at at time zone 'America/Winnipeg')::date = v_day;
  if v_event is null then
    v_starts := v_day::timestamp at time zone 'America/Winnipeg';
    perform set_config('academy.placeholder_service', 'on', true);
    insert into public.events (organization_id, title, starts_at, ends_at, is_placeholder)
    values (v_org, trim(to_char(v_day, 'Day')) || ' service', v_starts,
            least(((v_day + 1)::timestamp at time zone 'America/Winnipeg') - interval '1 minute',
                  v_starts + interval '24 hours'),
            true)
    returning id into v_event;
    perform set_config('academy.placeholder_service', 'off', true);
  end if;
  return v_event;
end;
$$;
revoke all on function public.open_current_service() from public, anon;
grant execute on function public.open_current_service() to authenticated;

-- ---------------------------------------------------------------------------
-- The settings
-- ---------------------------------------------------------------------------

create function public.checklist_settings()
returns table (service_type_id text, service_weekday integer, service_types jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_list_manager();
  return query
    select o.checklist_service_type_id, o.service_weekday::integer,
           coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name) order by t.name)
                       from public.pco_service_types t where t.organization_id = o.id), '[]'::jsonb)
    from public.organizations o where o.id = private.church_id();
end;
$$;

create function public.set_checklist_settings(p_service_type_id text, p_service_weekday integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before jsonb;
  v_after jsonb := jsonb_build_object('service_type_id', p_service_type_id,
                                      'service_weekday', p_service_weekday);
begin
  perform private.require_list_manager();
  if p_service_weekday is null or p_service_weekday not between 0 and 6
     or (p_service_type_id is not null and not exists (
           select 1 from public.pco_service_types t
           where t.id = p_service_type_id and t.organization_id = private.church_id())) then
    raise exception 'invalid_settings' using errcode = '22023';
  end if;
  select jsonb_build_object('service_type_id', o.checklist_service_type_id,
                            'service_weekday', o.service_weekday)
    into v_before from public.organizations o where o.id = private.church_id();
  if v_before = v_after then
    return;
  end if;
  update public.organizations o
     set checklist_service_type_id = p_service_type_id, service_weekday = p_service_weekday
   where o.id = private.church_id();
  perform private.write_checklist_log('edit', 'settings', 'ok', null, null, 'organizations',
    private.church_id(), 'Checklist settings', v_before, v_after, null);
end;
$$;

revoke all on function public.checklist_settings() from public, anon;
revoke all on function public.set_checklist_settings(text, integer) from public, anon;
grant execute on function public.checklist_settings() to authenticated;
grant execute on function public.set_checklist_settings(text, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- The sync records each plan's service type, and takes over an opened service day
-- ---------------------------------------------------------------------------

create or replace function public.sync_planning_center(p jsonb)
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
    -- A plan published for a day the checklist opened without one takes over that service, so
    -- its check-offs stay with it.
    update public.events e
       set source = 'planning_center', external_id = v_plan ->> 'id', is_placeholder = false,
           title = left(coalesce(nullif(trim(v_plan ->> 'title'), ''), 'Service'), 120),
           starts_at = (v_plan ->> 'starts_at')::timestamptz, ends_at = (v_plan ->> 'ends_at')::timestamptz,
           pco_service_type_id = v_plan ->> 'service_type_id'
     where e.id = (
       select x.id from public.events x
       where x.organization_id = v_org and x.is_placeholder and x.cancelled_at is null
         and (x.starts_at at time zone 'America/Winnipeg')::date
             = ((v_plan ->> 'starts_at')::timestamptz at time zone 'America/Winnipeg')::date
         and private.follows_checklist_service_type(v_org, v_plan ->> 'service_type_id')
       order by x.created_at limit 1)
       and not exists (
         select 1 from public.events y
         where y.organization_id = v_org and y.source = 'planning_center' and y.external_id = v_plan ->> 'id');
    insert into public.events
      (organization_id, title, starts_at, ends_at, location, source, external_id, pco_service_type_id)
    values (v_org, left(coalesce(nullif(trim(v_plan ->> 'title'), ''), 'Service'), 120),
            (v_plan ->> 'starts_at')::timestamptz, (v_plan ->> 'ends_at')::timestamptz, '',
            'planning_center', v_plan ->> 'id', v_plan ->> 'service_type_id')
    on conflict (organization_id, source, external_id) where external_id is not null do update
      set title = excluded.title, starts_at = excluded.starts_at, ends_at = excluded.ends_at,
          pco_service_type_id = excluded.pco_service_type_id, cancelled_at = null
      where (public.events.title, public.events.starts_at, public.events.ends_at,
             public.events.pco_service_type_id)
              is distinct from (excluded.title, excluded.starts_at, excluded.ends_at,
                                excluded.pco_service_type_id)
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
