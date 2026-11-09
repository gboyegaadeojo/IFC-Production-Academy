-- The "Who schedules" switch (plan "Academy scheduling", PR 1): while the Academy schedules, the
-- Planning Center sync can't write the schedule, and while Planning Center schedules, service
-- types can't be changed in the Academy.
begin;
select no_plan();

create function pg_temp.new_user(p_id uuid, p_name text, p_email text) returns void language sql as $$
  insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated',
          p_email, jsonb_build_object('full_name', p_name), now(), now());
$$;
create function pg_temp.act_as(p_id uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_id::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;
create function pg_temp.as_service() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role": "service_role"}', true);
  perform set_config('role', 'service_role', true);
end;
$$;

-- A fake organisation-wide scheduler.
select pg_temp.new_user('a7300000-0000-4000-8000-000000000001', 'Test Switch Admin', 'switch.admin@example.com');
insert into public.user_roles (user_id, role_id, department_id) values
  ('a7300000-0000-4000-8000-000000000001', (select id from public.roles where key = 'scheduling_admin'), null);

create temporary table payload (p jsonb);
grant all on payload to service_role;
insert into payload values (jsonb_build_object(
  'from', now() - interval '1 day', 'to', now() + interval '60 days',
  'service_types', '[]'::jsonb, 'teams', '[]'::jsonb, 'people', '[]'::jsonb,
  'roster', '[]'::jsonb, 'plans', '[]'::jsonb, 'blockouts', '[]'::jsonb));

-- Planning Center schedules: the sync runs, and service types are read-only in the Academy.
update public.organizations set scheduling_source = 'planning_center';

select pg_temp.as_service();
select lives_ok($$ select public.sync_planning_center((select p from payload)) $$,
  'the sync applies while Planning Center schedules');
select lives_ok($$ select public.sync_service_plan_items('{"plans": []}'::jsonb) $$,
  'and so does the run of service');
reset role;

select pg_temp.act_as('a7300000-0000-4000-8000-000000000001');
select throws_ok(
  $$ insert into public.service_types (name, start_time) values ('Fake Switch Sunday', '10:30') $$,
  'P0001', 'managed_in_planning_center',
  'service types cannot be added in the Academy while Planning Center schedules');
reset role;

-- The Academy schedules: the sync is refused, and service types can be added.
select pg_temp.act_as('a7300000-0000-4000-8000-000000000001');
select lives_ok($$ select public.set_scheduling_source('academy') $$, 'the scheduler switches to the Academy');
select lives_ok(
  $$ insert into public.service_types (name, start_time) values ('Fake Switch Sunday', '10:30') $$,
  'service types can be added once the Academy schedules');
reset role;

select pg_temp.as_service();
select throws_ok($$ select public.sync_planning_center((select p from payload)) $$,
  'P0001', 'academy_schedules', 'the sync is refused while the Academy schedules');
select throws_ok($$ select public.sync_service_plan_items('{"plans": []}'::jsonb) $$,
  'P0001', 'academy_schedules', 'and so is the run of service');
reset role;

-- The unguarded bodies can't be called from outside.
select ok(
  not has_function_privilege('service_role', 'private.apply_planning_center_sync(jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'private.apply_planning_center_sync(jsonb)', 'execute')
  and not has_function_privilege('service_role', 'private.apply_service_plan_items(jsonb)', 'execute'),
  'only the guarded wrappers can apply the sync');
select ok(
  not has_function_privilege('authenticated', 'public.sync_planning_center(jsonb)', 'execute'),
  'signed-in people still cannot run the sync');

select * from finish();
rollback;
