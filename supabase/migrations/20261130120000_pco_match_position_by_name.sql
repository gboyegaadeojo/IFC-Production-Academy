-- Scheduled people whose position the sync script couldn't match (checklist app US-15, C38).
--
-- Planning Center names a scheduled person's position instead of giving its id, and the script
-- matches the name against the team's positions as it reads them. When that misses (a team used
-- in more than one service type can come back without its positions), the person fell back to the
-- whole-team link and showed as "not linked" even though their position was linked. The database
-- now matches the name itself, against the positions it already has for that team, ignoring
-- capitals and extra spaces.

create function private.pco_member_role(p_team_id text, p_position_id text, p_position_name text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select private.pco_role(
    p_team_id,
    coalesce(
      nullif(p_position_id, ''),
      (select p.id from public.pco_positions p
        where p.team_id = p_team_id
          and lower(regexp_replace(trim(p.name), '\s+', ' ', 'g'))
              = lower(regexp_replace(trim(coalesce(p_position_name, '')), '\s+', ' ', 'g'))
        order by p.id limit 1)));
$$;
revoke all on function private.pco_member_role(text, text, text) from public, anon, authenticated;

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

  -- Which Planning Center organization this is, for sign-in.
  if nullif(p ->> 'organization_id', '') is not null then
    update public.organizations o set pco_organization_id = p ->> 'organization_id'
     where o.id = v_org and o.pco_organization_id is distinct from p ->> 'organization_id';
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

  -- Who they are in the Academy: the active account linked to them by Planning Center sign-in,
  -- else an active account whose sign-in email is one of theirs.
  insert into public.pco_people (id, organization_id, display_name, user_id, seen_at)
  select x ->> 'id', v_org, coalesce(x ->> 'name', ''),
         coalesce(
           (select pr.id from public.profiles pr
             where pr.pco_person_id = x ->> 'id' and pr.status = 'active'),
           (select u.id from auth.users u
              join public.profiles pr on pr.id = u.id and pr.status = 'active'
             where lower(u.email) in (select lower(trim(e)) from jsonb_array_elements_text(coalesce(x -> 'emails', '[]')) e)
             order by u.created_at limit 1)),
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
      v_role_id := private.pco_member_role(
        v_member ->> 'team_id', v_member ->> 'position_id', v_member ->> 'position_name');
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
