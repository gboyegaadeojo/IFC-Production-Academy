-- Details the approved Profile and Checklist mocks show (2026-11-01). Read-only; no new tables.
-- * my_planning_center() also returns the Planning Center teams you're on: the teams linked to
--   positions whose team you belong to. Your own rows only; Planning Center's tables stay readable
--   by Planning Center admins alone.
-- * event_checklists() also returns each checklist's department hue, for the board's colour dots.
-- * service_checklist_state() also returns the positions you're scheduled in for that service,
--   for "You're serving · Camera 1".

drop function public.my_planning_center();
create function public.my_planning_center()
returns table (linked boolean, pco_name text, pco_teams text[])
language sql
stable
security definer
set search_path = ''
as $$
  select pr.pco_person_id is not null,
         (select nullif(trim(pp.display_name), '') from public.pco_people pp where pp.id = pr.pco_person_id),
         coalesce(
           (select array_agg(distinct t.name order by t.name)
            from public.serving_team_members m
            join public.pco_links l on l.role_id = m.role_id
            join public.pco_teams t on t.id = l.pco_team_id
            where m.user_id = pr.id and m.removed_at is null),
           '{}'::text[])
  from public.profiles pr
  where pr.id = (select auth.uid()) and private.is_active_user();
$$;
revoke all on function public.my_planning_center() from public, anon;
grant execute on function public.my_planning_center() to authenticated;

drop function public.event_checklists(uuid);
create function public.event_checklists(p_event_id uuid)
returns table (
  checklist_id uuid,
  checklist_name text,
  department_name text,
  department_hue text,
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
declare
  v_set uuid;
begin
  if not private.can_view_service_checklists(p_event_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  v_set := private.service_checklist_set(p_event_id);
  return query
    with mine as (
      select distinct c.id
      from public.checklists c
      join public.event_assignments a
        on a.event_id = p_event_id and a.user_id = (select auth.uid())
       and a.status in ('pending', 'confirmed')
      where c.archived_at is null and c.set_id = v_set
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
    select c.id, c.name, d.name, d.hue, c.id in (select m.id from mine m),
           s.id, s.name, i.id, i.text, live.display_name, live.checked_at
    from public.checklists c
    join public.departments d on d.id = c.department_id
    join public.checklist_sections s on s.checklist_id = c.id and s.archived_at is null
    join public.checklist_items i on i.section_id = s.id and i.archived_at is null
    left join live on live.item_id = i.id
    where c.archived_at is null and c.set_id = v_set
    order by (c.id in (select m.id from mine m)) desc, c.sort_order, c.name,
             s.sort_order, i.sort_order;
end;
$$;
revoke all on function public.event_checklists(uuid) from public, anon;
grant execute on function public.event_checklists(uuid) to authenticated;

drop function public.service_checklist_state(uuid);
create function public.service_checklist_state(p_event_id uuid)
returns table (
  can_lead boolean,
  can_tick boolean,
  open boolean,
  undo_available boolean,
  is_scheduled boolean,
  sees_all boolean,
  my_positions text[]
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
           private.is_serving_at(p_event_id),
           private.sees_all_checklists(p_event_id),
           coalesce(
             (select array_agg(distinct r.name order by r.name)
              from public.event_assignments a
              join public.serving_roles r on r.id = a.role_id
              where a.event_id = p_event_id and a.user_id = (select auth.uid())
                and a.status in ('pending', 'confirmed')),
             '{}'::text[]);
end;
$$;
revoke all on function public.service_checklist_state(uuid) from public, anon;
grant execute on function public.service_checklist_state(uuid) to authenticated;
