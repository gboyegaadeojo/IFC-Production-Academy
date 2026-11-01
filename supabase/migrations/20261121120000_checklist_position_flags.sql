-- Two switches per position, as on the checklist app's Team mapping page (its US-05, C41):
--
-- * "Sees all departments": whoever is scheduled in it sees every department's checklist by
--   default (for example Technical Director).
-- * "Gets the Director role while scheduled": whoever is scheduled in it can reset and undo that
--   service's checklists. This is the existing serving_roles.leads_service.
--
-- Positions that already lead the service keep both, so nothing changes for them.

alter table public.serving_roles add column sees_all_checklists boolean not null default false;
update public.serving_roles set sees_all_checklists = true where leads_service;

comment on column public.serving_roles.leads_service is
  'Gets the Director role while scheduled: can reset and undo the service''s checklists.';
comment on column public.serving_roles.sees_all_checklists is
  'Sees all departments: whoever is scheduled in it sees every checklist by default.';

create function public.set_role_sees_all(p_role_id uuid, p_sees_all boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_department_id uuid;
begin
  select r.department_id into v_department_id from public.serving_roles r where r.id = p_role_id;
  if v_department_id is null or not private.has_capability('team.manage', v_department_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  update public.serving_roles r set sees_all_checklists = p_sees_all where r.id = p_role_id;
end;
$$;
revoke all on function public.set_role_sees_all(uuid, boolean) from public, anon;
grant execute on function public.set_role_sees_all(uuid, boolean) to authenticated;

-- Sees every department by default: scheduled in a "sees all" position, or an
-- organisation-wide checklist manager.
create function private.sees_all_checklists(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_capability('checklist.manage')
    or exists (
      select 1 from public.event_assignments a
      join public.serving_roles r on r.id = a.role_id and r.sees_all_checklists
      where a.event_id = p_event_id and a.user_id = (select auth.uid())
        and a.status in ('pending', 'confirmed')
    );
$$;
revoke all on function private.sees_all_checklists(uuid) from public, anon, authenticated;

drop function public.service_checklist_state(uuid);
create function public.service_checklist_state(p_event_id uuid)
returns table (
  can_lead boolean,
  can_tick boolean,
  open boolean,
  undo_available boolean,
  is_scheduled boolean,
  sees_all boolean
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
           private.sees_all_checklists(p_event_id);
end;
$$;
revoke all on function public.service_checklist_state(uuid) from public, anon;
grant execute on function public.service_checklist_state(uuid) to authenticated;
