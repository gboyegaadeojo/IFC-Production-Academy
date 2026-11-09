-- The "Who schedules" switch, made real (G, 2026-11-09; plan "Academy scheduling", PR 1).
--
-- While the Academy schedules, the Planning Center sync must not write the schedule: its plans
-- would overwrite services, its rosters would replace serving teams, and plans it no longer sees
-- would be cancelled. The sync job checks the setting first and stops (scripts/
-- sync-planning-center.ts); these wrappers refuse as well, so no caller can write the schedule
-- from Planning Center by mistake.
--
-- The existing bodies move to private, unchanged, and public keeps the same signatures. To change
-- what the sync does, replace private.apply_planning_center_sync or
-- private.apply_service_plan_items, never the public wrappers.
--
-- Service types and their positions join the read-only guard, as the services made from them
-- already did.

alter function public.sync_planning_center(jsonb) set schema private;
alter function private.sync_planning_center(jsonb) rename to apply_planning_center_sync;
revoke all on function private.apply_planning_center_sync(jsonb) from public, anon, authenticated, service_role;

alter function public.sync_service_plan_items(jsonb) set schema private;
alter function private.sync_service_plan_items(jsonb) rename to apply_service_plan_items;
revoke all on function private.apply_service_plan_items(jsonb) from public, anon, authenticated, service_role;

-- Planning Center schedules for the (single) organisation the sync works on.
create function private.planning_center_schedules()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select o.scheduling_source = 'planning_center' from public.organizations o
     order by o.created_at limit 1),
    false);
$$;
revoke all on function private.planning_center_schedules() from public, anon, authenticated;

create function public.sync_planning_center(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.planning_center_schedules() then
    raise exception 'academy_schedules' using errcode = 'P0001';
  end if;
  return private.apply_planning_center_sync(p);
end;
$$;
revoke all on function public.sync_planning_center(jsonb) from public, anon, authenticated;
grant execute on function public.sync_planning_center(jsonb) to service_role;

create function public.sync_service_plan_items(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.planning_center_schedules() then
    raise exception 'academy_schedules' using errcode = 'P0001';
  end if;
  return private.apply_service_plan_items(p);
end;
$$;
revoke all on function public.sync_service_plan_items(jsonb) from public, anon, authenticated;
grant execute on function public.sync_service_plan_items(jsonb) to service_role;

create trigger service_types_planning_center_guard before insert or update on public.service_types
  for each row execute function private.guard_planning_center_writes();
create trigger service_type_positions_planning_center_guard before insert or update or delete on public.service_type_positions
  for each row execute function private.guard_planning_center_writes();
