-- Switching who schedules copies what's there (G, 2026-11-09; plan "Academy scheduling", PR 2).
--
-- To the Academy: what's coming up from Planning Center becomes the Academy's own, so nothing is
-- typed in again. Upcoming services keep their positions, who's scheduled, and each reply; service
-- types are made from Planning Center's, with the positions their services use; team members and
-- blockouts carry over. Every copied row keeps its Planning Center id. Past services aren't touched.
-- Nobody is emailed: assignments aren't changed, only where the rows came from.
--
-- Back to Planning Center: the copied rows are handed back, matched by their Planning Center ids,
-- so the next sync updates them instead of adding a second copy. Services, team members, and
-- blockouts added in the Academy meanwhile stay as they are.
--
-- Each switch is in the audit log with its counts (SRS-AUDIT-001).

alter table public.serving_team_members
  add column copied_from_planning_center boolean not null default false;
comment on column public.serving_team_members.copied_from_planning_center is
  'Set when the Academy took over scheduling, so switching back hands the row back to the sync.';

alter table public.service_types add column pco_service_type_id text;
create unique index service_types_pco_idx on public.service_types (organization_id, pco_service_type_id)
  where pco_service_type_id is not null and archived_at is null;

-- The sync holds the organisation row while it applies, so a switch waits for a sync in progress
-- and a sync that starts after a switch sees it.
create or replace function private.planning_center_schedules()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source text;
begin
  select o.scheduling_source into v_source
  from public.organizations o order by o.created_at limit 1
  for share;
  return coalesce(v_source = 'planning_center', false);
end;
$$;
revoke all on function private.planning_center_schedules() from public, anon, authenticated;

-- What's coming up from Planning Center: services that haven't ended.
create function private.upcoming_planning_center_events(p_org uuid)
returns setof public.events
language sql
stable
security definer
set search_path = ''
as $$
  select e.* from public.events e
  where e.organization_id = p_org and e.source = 'planning_center'
    and e.external_id is not null and not e.is_placeholder and e.ends_at > now();
$$;
revoke all on function private.upcoming_planning_center_events(uuid) from public, anon, authenticated;

create function private.copy_from_planning_center(p_org uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type record;
  v_type_id uuid;
  v_first public.events;
  v_types integer := 0;
  v_services integer;
  v_assignments integer;
  v_members integer;
  v_blockouts integer;
begin
  -- Service types, one for each Planning Center service type with a service coming up.
  for v_type in
    select st.id, st.name
    from public.pco_service_types st
    where st.organization_id = p_org
      and exists (select 1 from private.upcoming_planning_center_events(p_org) e
                  where e.pco_service_type_id = st.id and e.cancelled_at is null)
    order by st.name
  loop
    select t.id into v_type_id from public.service_types t
    where t.organization_id = p_org and t.archived_at is null
      and (t.pco_service_type_id = v_type.id or lower(trim(t.name)) = lower(trim(v_type.name)))
    order by (t.pco_service_type_id = v_type.id) desc nulls last
    limit 1;

    if v_type_id is null then
      select e.* into v_first from private.upcoming_planning_center_events(p_org) e
      where e.pco_service_type_id = v_type.id and e.cancelled_at is null
      order by e.starts_at limit 1;
      insert into public.service_types (organization_id, name, start_time, duration_minutes, location, pco_service_type_id)
      values (p_org, left(coalesce(nullif(trim(v_type.name), ''), 'Service'), 80),
              (v_first.starts_at at time zone 'America/Winnipeg')::time,
              least(720, greatest(15, (extract(epoch from v_first.ends_at - v_first.starts_at) / 60)::integer)),
              left(coalesce(v_first.location, ''), 120), v_type.id)
      returning id into v_type_id;
      v_types := v_types + 1;

      -- Its positions: each role its services use, as many times as the busiest service needs it.
      insert into public.service_type_positions (service_type_id, role_id, department_id, sort_order)
      select v_type_id, r.role_id, r.department_id,
             (row_number() over (order by d.sort_order, d.name, sr.name, r.role_id, g.n))::integer
      from (
        select per_event.role_id, per_event.department_id, max(per_event.places) as places
        from (
          select ep.role_id, ep.department_id, ep.event_id, count(*) as places
          from public.event_positions ep
          join private.upcoming_planning_center_events(p_org) e on e.id = ep.event_id
          where e.pco_service_type_id = v_type.id
          group by ep.role_id, ep.department_id, ep.event_id
        ) per_event
        group by per_event.role_id, per_event.department_id
      ) r
      join public.serving_roles sr on sr.id = r.role_id and sr.archived_at is null
      join public.departments d on d.id = r.department_id
      cross join lateral generate_series(1, r.places::integer) g(n);
    else
      update public.service_types t set pco_service_type_id = v_type.id
       where t.id = v_type_id and t.pco_service_type_id is null;
    end if;

    update public.events e set service_type_id = v_type_id
     where e.id in (select u.id from private.upcoming_planning_center_events(p_org) u
                    where u.pco_service_type_id = v_type.id)
       and e.service_type_id is null;
  end loop;

  select count(*) into v_assignments
  from public.event_assignments a
  join private.upcoming_planning_center_events(p_org) e on e.id = a.event_id
  where a.status in ('pending', 'confirmed', 'declined');

  -- Services, with their positions and who's scheduled.
  update public.events e set source = 'academy'
   where e.id in (select u.id from private.upcoming_planning_center_events(p_org) u);
  get diagnostics v_services = row_count;

  -- Team members and blockouts.
  update public.serving_team_members t
     set source = 'academy', copied_from_planning_center = true
   where t.source = 'planning_center' and t.removed_at is null
     and exists (select 1 from public.serving_roles r join public.departments d on d.id = r.department_id
                 where r.id = t.role_id and d.organization_id = p_org);
  get diagnostics v_members = row_count;

  update public.unavailability u set source = 'academy'
   where u.source = 'planning_center' and u.external_id is not null
     and u.ends_on >= (now() at time zone 'America/Winnipeg')::date
     and exists (select 1 from public.profiles pr where pr.id = u.user_id and pr.organization_id = p_org);
  get diagnostics v_blockouts = row_count;

  return jsonb_build_object('service_types', v_types, 'services', v_services,
    'assignments', v_assignments, 'team_members', v_members, 'blockouts', v_blockouts);
end;
$$;
revoke all on function private.copy_from_planning_center(uuid) from public, anon, authenticated;

create function private.hand_back_to_planning_center(p_org uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_services integer;
  v_members integer;
  v_blockouts integer;
begin
  update public.events e set source = 'planning_center'
   where e.organization_id = p_org and e.source = 'academy' and e.external_id is not null
     and not e.is_placeholder and e.ends_at > now()
     and not exists (select 1 from public.events x
                     where x.organization_id = p_org and x.source = 'planning_center'
                       and x.external_id = e.external_id);
  get diagnostics v_services = row_count;

  update public.serving_team_members t
     set source = 'planning_center', copied_from_planning_center = false
   where t.copied_from_planning_center and t.removed_at is null
     and exists (select 1 from public.serving_roles r join public.departments d on d.id = r.department_id
                 where r.id = t.role_id and d.organization_id = p_org);
  get diagnostics v_members = row_count;

  update public.unavailability u set source = 'planning_center'
   where u.source = 'academy' and u.external_id is not null
     and exists (select 1 from public.profiles pr where pr.id = u.user_id and pr.organization_id = p_org);
  get diagnostics v_blockouts = row_count;

  return jsonb_build_object('services', v_services, 'team_members', v_members, 'blockouts', v_blockouts);
end;
$$;
revoke all on function private.hand_back_to_planning_center(uuid) from public, anon, authenticated;

-- What switching would copy or hand back, for the confirmation on the Planning Center page.
create function public.scheduling_switch_preview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.current_organization_id();
begin
  if not private.has_capability('schedule.manage') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'service_types', (select count(distinct e.pco_service_type_id)
                      from private.upcoming_planning_center_events(v_org) e
                      where e.cancelled_at is null and e.pco_service_type_id is not null),
    'services', (select count(*) from private.upcoming_planning_center_events(v_org) e
                 where e.cancelled_at is null),
    'assignments', (select count(*) from public.event_assignments a
                    join private.upcoming_planning_center_events(v_org) e on e.id = a.event_id
                    where a.status in ('pending', 'confirmed', 'declined')),
    'team_members', (select count(*) from public.serving_team_members t
                     join public.serving_roles r on r.id = t.role_id
                     join public.departments d on d.id = r.department_id
                     where d.organization_id = v_org and t.source = 'planning_center'
                       and t.removed_at is null),
    'blockouts', (select count(*) from public.unavailability u
                  join public.profiles pr on pr.id = u.user_id and pr.organization_id = v_org
                  where u.source = 'planning_center' and u.external_id is not null
                    and u.ends_on >= (now() at time zone 'America/Winnipeg')::date),
    'academy_services', (select count(*) from public.events e
                         where e.organization_id = v_org and e.source = 'academy'
                           and e.external_id is null and e.ends_at > now()
                           and e.cancelled_at is null and not e.is_placeholder)
  );
end;
$$;
revoke all on function public.scheduling_switch_preview() from public, anon;
grant execute on function public.scheduling_switch_preview() to authenticated;

create or replace function public.set_scheduling_source(p_source text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.current_organization_id();
  v_current text;
  v_counts jsonb;
begin
  if not private.has_capability('schedule.manage') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_source not in ('academy', 'planning_center') then
    raise exception 'invalid_source' using errcode = '22023';
  end if;
  -- Waits for a sync in progress (it holds this row), and keeps two switches from crossing.
  select o.scheduling_source into v_current from public.organizations o where o.id = v_org for update;
  if v_current = p_source then
    return;
  end if;
  -- The copy and the hand back change schedule rows, which only the Academy may do while it
  -- schedules: so switch first when taking over, and hand back before switching back.
  if p_source = 'academy' then
    update public.organizations o set scheduling_source = p_source where o.id = v_org;
    v_counts := private.copy_from_planning_center(v_org);
  else
    v_counts := private.hand_back_to_planning_center(v_org);
    update public.organizations o set scheduling_source = p_source where o.id = v_org;
  end if;
  insert into public.audit_events (organization_id, actor_id, action, target_table, target_id, metadata)
  values (v_org, (select auth.uid()),
    case when p_source = 'academy' then 'scheduling.switched_to_academy'
         else 'scheduling.switched_to_planning_center' end,
    'organizations', v_org, v_counts);
end;
$$;
revoke all on function public.set_scheduling_source(text) from public, anon;
grant execute on function public.set_scheduling_source(text) to authenticated;
