-- The sync job asks who schedules through a function, since the service role can't read
-- organizations directly in production (fix for the academy switch, 2026-11-10).
begin;
select no_plan();

create function pg_temp.as_service() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role": "service_role"}', true);
  perform set_config('role', 'service_role', true);
end;
$$;

-- As in production: no direct read of organizations for the service role.
revoke select on public.organizations from service_role;

update public.organizations set scheduling_source = 'planning_center';
select pg_temp.as_service();
select is(public.planning_center_schedules(), true, 'the job sees that Planning Center schedules');
reset role;

update public.organizations set scheduling_source = 'academy';
select pg_temp.as_service();
select is(public.planning_center_schedules(), false, 'and that the Academy schedules');
reset role;

select ok(
  has_function_privilege('service_role', 'public.planning_center_schedules()', 'execute')
  and not has_function_privilege('authenticated', 'public.planning_center_schedules()', 'execute')
  and not has_function_privilege('anon', 'public.planning_center_schedules()', 'execute'),
  'only the service role can ask');

-- PostgREST runs stable functions read-only, where the helper's FOR SHARE is refused (HTTP 405).
select is(
  (select provolatile::text from pg_proc where oid = 'public.planning_center_schedules()'::regprocedure),
  'v',
  'the check runs read-write through the API');

select * from finish();
rollback;
