-- Service-day checklists work as IFC's Sunday Pre-Service Checklist app does (its requirements
-- US-02, US-05, US-06, US-07, US-09, US-10):
--
-- * Anyone on the media team (on any position's team) can open a service's checklists and tick,
--   scheduled or not: last-minute subs can help. Scheduled volunteers see their own checklist by
--   default and can show every department; the page decides what's shown, never what's allowed.
-- * Whoever leads the service (a leading position, such as Technical Director or Production
--   Director, or an organisation-wide checklist manager) sees every department by default and can
--   reset and undo.
-- * A reset is refused when nothing is ticked, so an accidental second reset can never take away
--   the chance to undo the first.

-- On the media team: on at least one position's team, in an active department membership.
create function private.is_team_member()
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
    where t.user_id = (select auth.uid()) and t.removed_at is null
  );
$$;
revoke all on function private.is_team_member() from public, anon, authenticated;

create function private.can_tick_service(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_active_user() and (
    private.is_serving_at(p_event_id)
    or private.leads_service(p_event_id)
    or private.is_team_member()
  );
$$;
revoke all on function private.can_tick_service(uuid) from public, anon, authenticated;

create or replace function private.can_view_service_checklists(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_active_user() and (
    private.can_tick_service(p_event_id)
    or private.has_capability_anywhere('checklist.manage')
    or exists (
      select 1 from public.event_positions p
      where p.event_id = p_event_id and private.has_capability('schedule.manage', p.department_id)
    )
  );
$$;

-- "Mine" is the checklists for the positions I'm scheduled in at this service; a checklist not
-- linked to any position counts as mine if it's in my department there.
create or replace function public.event_checklists(p_event_id uuid)
returns table (
  checklist_id uuid,
  checklist_name text,
  department_name text,
  is_mine boolean,
  section_id uuid,
  section_name text,
  item_id uuid,
  item_text text,
  checked_by_name text,
  checked_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.can_view_service_checklists(p_event_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  return query
    with mine as (
      select distinct c.id
      from public.checklists c
      join public.event_assignments a
        on a.event_id = p_event_id and a.user_id = (select auth.uid())
       and a.status in ('pending', 'confirmed')
      where c.archived_at is null
        and (
          exists (select 1 from public.checklist_positions cp
                  where cp.checklist_id = c.id and cp.role_id = a.role_id)
          or (c.department_id = a.department_id
              and not exists (select 1 from public.checklist_positions cp
                              where cp.checklist_id = c.id))
        )
    ),
    live as (
      select k.item_id, k.checked_at, pr.display_name
      from public.checklist_checkoffs k
      join public.profiles pr on pr.id = k.checked_by
      where k.event_id = p_event_id and k.unchecked_at is null and k.reset_id is null
    )
    select c.id, c.name, d.name, c.id in (select m.id from mine m),
           s.id, s.name, i.id, i.text, live.display_name, live.checked_at
    from public.checklists c
    join public.departments d on d.id = c.department_id
    join public.checklist_sections s on s.checklist_id = c.id and s.archived_at is null
    join public.checklist_items i on i.section_id = s.id and i.archived_at is null
    left join live on live.item_id = i.id
    where c.archived_at is null
    order by (c.id in (select m.id from mine m)) desc, d.sort_order, c.name,
             s.sort_order, i.sort_order;
end;
$$;

create or replace function public.set_checklist_item(p_event_id uuid, p_item_id uuid, p_checked boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item record;
begin
  if not private.can_tick_service(p_event_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if not private.checklist_open(p_event_id) then
    raise exception 'checklist_closed' using errcode = 'P0001';
  end if;
  select i.id, i.text, s.name as section_name, c.id as checklist_id, c.name as checklist_name
    into v_item
  from public.checklist_items i
  join public.checklist_sections s on s.id = i.section_id
  join public.checklists c on c.id = i.checklist_id
  where i.id = p_item_id and i.archived_at is null and s.archived_at is null
    and c.archived_at is null;
  if v_item.id is null then
    raise exception 'item_not_found' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_event_id::text || p_item_id::text, 0));
  if p_checked then
    insert into public.checklist_checkoffs
      (event_id, item_id, checklist_id, item_text, section_name, checklist_name, checked_by)
    values (p_event_id, p_item_id, v_item.checklist_id, v_item.text, v_item.section_name,
            v_item.checklist_name, (select auth.uid()))
    on conflict (event_id, item_id) where unchecked_at is null and reset_id is null do nothing;
  else
    update public.checklist_checkoffs k
       set unchecked_at = now(), unchecked_by = (select auth.uid())
     where k.event_id = p_event_id and k.item_id = p_item_id
       and k.unchecked_at is null and k.reset_id is null;
  end if;
end;
$$;

create or replace function public.reset_service_checklists(p_event_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reset_id uuid;
  v_count integer;
begin
  if not private.leads_service(p_event_id) or not private.is_active_user() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if not private.checklist_open(p_event_id) then
    raise exception 'checklist_closed' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_event_id::text || 'checklist-reset', 0));
  if not exists (
    select 1 from public.checklist_checkoffs k
    where k.event_id = p_event_id and k.unchecked_at is null and k.reset_id is null
  ) then
    raise exception 'nothing_to_reset' using errcode = 'P0001';
  end if;
  insert into public.checklist_resets (event_id, reset_by) values (p_event_id, (select auth.uid()))
  returning id into v_reset_id;
  update public.checklist_checkoffs k set reset_id = v_reset_id
   where k.event_id = p_event_id and k.unchecked_at is null and k.reset_id is null;
  get diagnostics v_count = row_count;
  update public.checklist_resets r set cleared = v_count where r.id = v_reset_id;
  insert into public.audit_events (organization_id, actor_id, action, target_table, target_id, metadata)
  values (private.current_organization_id(), (select auth.uid()), 'checklist.reset',
          'events', p_event_id, jsonb_build_object('cleared', v_count));
  return v_count;
end;
$$;

-- Adds whether this person is scheduled at the service, for "you can still help".
drop function public.service_checklist_state(uuid);
create function public.service_checklist_state(p_event_id uuid)
returns table (
  can_lead boolean,
  can_tick boolean,
  open boolean,
  undo_available boolean,
  is_scheduled boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.can_view_service_checklists(p_event_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  return query
    select private.leads_service(p_event_id),
           private.can_tick_service(p_event_id),
           private.checklist_open(p_event_id),
           exists (
             select 1 from public.checklist_resets r
             where r.event_id = p_event_id and r.undone_at is null
               and r.reset_at = (select max(r2.reset_at) from public.checklist_resets r2
                                 where r2.event_id = p_event_id)
           ),
           private.is_serving_at(p_event_id);
end;
$$;
revoke all on function public.service_checklist_state(uuid) from public, anon;
grant execute on function public.service_checklist_state(uuid) to authenticated;

-- The current service, as the checklist app picks it: the earliest service whose Winnipeg date
-- is today or later. It stays current until the end of its day.
create function public.current_service()
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
  order by
    -- A service I'm scheduled at that day comes before others on the same day.
    (e.starts_at at time zone 'America/Winnipeg')::date,
    not exists (
      select 1 from public.event_assignments a
      where a.event_id = e.id and a.user_id = (select auth.uid())
        and a.status in ('pending', 'confirmed')
    ),
    e.starts_at
  limit 1;
$$;
revoke all on function public.current_service() from public, anon;
grant execute on function public.current_service() to authenticated;
