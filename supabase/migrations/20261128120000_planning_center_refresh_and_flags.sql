-- Planning Center catch-ups from IFC's checklist app (its US-15, C29, C39):
--
-- * Who is scheduled in a position that isn't linked to an Academy position, or whose position
--   name matches nothing in Planning Center, so admins can fix the link before the service
--   instead of that person silently missing their checklist. The sync replaces the list each
--   time; it holds Planning Center ids and a position name, and names come from pco_people.
-- * "Refresh from Planning Center": a request the app records (at most one every two minutes,
--   audited) before asking GitHub to run the sync workflow now.

create table public.pco_unlinked_scheduled (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  event_id uuid not null references public.events (id) on delete cascade,
  pco_member_id text not null unique,
  pco_person_id text not null,
  pco_team_id text not null,
  position_name text not null default '' check (length(position_name) <= 120),
  synced_at timestamptz not null default now()
);
create index pco_unlinked_scheduled_event_idx on public.pco_unlinked_scheduled (event_id);

alter table public.pco_unlinked_scheduled enable row level security;
-- Planning Center admins fix the links; checklist managers see who will miss a checklist.
create policy "Planning Center and checklist managers read unlinked places"
  on public.pco_unlinked_scheduled for select to authenticated
  using (private.manages_planning_center() or private.has_capability_anywhere('checklist.manage'));
grant select on public.pco_unlinked_scheduled to authenticated;

-- Upcoming services' unlinked places, with names, for Planning Center admins and checklist
-- managers. p_event_id narrows it to one service.
create function public.pco_unlinked_places(p_event_id uuid default null)
returns table (
  event_id uuid, event_title text, starts_at timestamptz, person_name text, team_name text,
  position_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_active_user()
     or not (private.manages_planning_center() or private.has_capability_anywhere('checklist.manage')) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  return query
    select e.id, e.title, e.starts_at, coalesce(nullif(pp.display_name, ''), 'Someone in Planning Center'),
           coalesce(t.name, ''), u.position_name
    from public.pco_unlinked_scheduled u
    join public.events e on e.id = u.event_id and e.cancelled_at is null
    left join public.pco_people pp on pp.id = u.pco_person_id
    left join public.pco_teams t on t.id = u.pco_team_id
    where u.organization_id = private.church_id()
      and (p_event_id is null or u.event_id = p_event_id)
      and (e.starts_at at time zone 'America/Winnipeg')::date >= (now() at time zone 'America/Winnipeg')::date
    order by e.starts_at, 4, 5, 6;
end;
$$;
revoke all on function public.pco_unlinked_places(uuid) from public, anon;
grant execute on function public.pco_unlinked_places(uuid) to authenticated;

create table public.pco_refresh_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  requested_by uuid not null default auth.uid() references public.profiles (id),
  requested_at timestamptz not null default now()
);
create index pco_refresh_requests_at_idx on public.pco_refresh_requests (requested_at desc);

alter table public.pco_refresh_requests enable row level security;
create policy "Planning Center managers read refresh requests"
  on public.pco_refresh_requests for select to authenticated
  using (private.manages_planning_center());
grant select on public.pco_refresh_requests to authenticated;

create trigger pco_refresh_requests_audit after insert on public.pco_refresh_requests
  for each row execute function private.audit_change('pco_refresh');

-- Records a refresh request. Refused ('too_soon') within two minutes of the last one, so the
-- button can't start a run of syncs.
create function public.request_pco_refresh()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.church_id();
begin
  if not private.is_active_user() or not private.manages_planning_center() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('pco-refresh', 0));
  if exists (
    select 1 from public.pco_refresh_requests r
    where r.organization_id = v_org and r.requested_at > now() - interval '2 minutes'
  ) then
    raise exception 'too_soon' using errcode = 'P0001';
  end if;
  insert into public.pco_refresh_requests (organization_id) values (v_org);
end;
$$;
revoke all on function public.request_pco_refresh() from public, anon;
grant execute on function public.request_pco_refresh() to authenticated;

-- ---------------------------------------------------------------------------
-- The sync records who is scheduled in an unlinked position
-- ---------------------------------------------------------------------------

-- Plans may now carry each member's Planning Center position name:
--   plans [{..., members [{id, person_id, team_id, position_id, position_name, status}]}].
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

  -- Who's scheduled in a position that isn't linked: replaced each time.
  delete from public.pco_unlinked_scheduled u where u.organization_id = v_org;

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
        insert into public.pco_unlinked_scheduled
          (organization_id, event_id, pco_member_id, pco_person_id, pco_team_id, position_name)
        values (v_org, v_event, v_member ->> 'id', v_member ->> 'person_id', v_member ->> 'team_id',
                left(coalesce(nullif(trim(v_member ->> 'position_name'), ''),
                              (select p.name from public.pco_positions p where p.id = v_member ->> 'position_id'),
                              ''), 120))
        on conflict (pco_member_id) do nothing;
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
