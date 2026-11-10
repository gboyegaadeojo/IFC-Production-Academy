-- The sync job's "who schedules" check, through a function (fix for 20270119120000_academy_switch).
--
-- scripts/sync-planning-center.ts read organizations.scheduling_source straight from the table, but
-- in production the service role has no SELECT on organizations, so every run since 2026-11-09
-- failed with HTTP 403 and nothing synced. Like every other scheduled job, it now asks a function
-- granted to the service role alone.

create function public.planning_center_schedules()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.planning_center_schedules();
$$;
revoke all on function public.planning_center_schedules() from public, anon, authenticated;
grant execute on function public.planning_center_schedules() to service_role;
