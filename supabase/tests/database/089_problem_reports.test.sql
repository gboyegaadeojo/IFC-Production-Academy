-- Report a problem (health check follow-up, 2026-11-11): anyone signed in sends one; only
-- problem.review holders (Platform Admins) read them and mark them sorted, which is audited. The
-- table itself is closed to everyone.
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

select pg_temp.new_user('a8900000-0000-4000-8000-000000000001', 'Test Reporter', 'reporter@example.com');
select pg_temp.new_user('a8900000-0000-4000-8000-000000000002', 'Test Report Admin', 'report.admin@example.com');
insert into public.user_roles (user_id, role_id, department_id) values
  ('a8900000-0000-4000-8000-000000000002', (select id from public.roles where key = 'platform_admin'), null);

-- A volunteer sends one.
select pg_temp.act_as('a8900000-0000-4000-8000-000000000001');
select lives_ok(
  $$ select public.report_problem('The tick went back', '/serve/x', 'iPhone, app installed', 'abc123') $$,
  'anyone signed in can report a problem');
select throws_ok($$ select public.report_problem('   ') $$, 'P0001', 'empty_report',
  'an empty report is refused');
select throws_ok($$ select * from public.problem_reports_list(true) $$, '42501', null,
  'a volunteer cannot read the reports');
select throws_ok($$ select count(*) from public.problem_reports $$, '42501', null,
  'nor the table itself');
select is(public.problem_reports_open_count(), 0, 'and sees no count');
reset role;

select is(
  (select count(*)::int from public.notifications
   where user_id = 'a8900000-0000-4000-8000-000000000002' and kind = 'problem_reported'),
  1, 'the platform admin is notified');
select is(
  (select count(*)::int from public.notifications
   where user_id = 'a8900000-0000-4000-8000-000000000001' and kind = 'problem_reported'),
  0, 'the reporter is not');

-- No more than 10 a day each.
select pg_temp.act_as('a8900000-0000-4000-8000-000000000001');
select public.report_problem('Another ' || n) from generate_series(1, 9) n;
select throws_ok($$ select public.report_problem('One too many') $$, 'P0001', 'too_many_reports',
  'an eleventh report in a day is refused');
reset role;

-- The admin reads them and marks one sorted, which is audited.
select pg_temp.act_as('a8900000-0000-4000-8000-000000000002');
select is((select count(*)::int from public.problem_reports_list(false)), 10,
  'the admin reads the open reports');
select lives_ok(
  $$ select public.set_problem_report_status(
       (select id from public.problem_reports_list(false) where message = 'The tick went back'), true) $$,
  'and marks one sorted');
select is((select count(*)::int from public.problem_reports_list(false)), 9, 'it leaves the open list');
select is(public.problem_reports_open_count(), 9, 'and the sidebar count drops');
select is((select count(*)::int from public.problem_reports_list(true)), 10, 'but stays under All');
reset role;
select is(
  (select count(*)::int from public.audit_events
   where action = 'problem_report.sorted' and actor_id = 'a8900000-0000-4000-8000-000000000002'),
  1, 'marking it sorted is in the audit log');

select pg_temp.act_as('a8900000-0000-4000-8000-000000000001');
select throws_ok(
  $$ select public.set_problem_report_status(gen_random_uuid(), true) $$, '42501', null,
  'a volunteer cannot mark reports');
reset role;

select * from finish();
rollback;
